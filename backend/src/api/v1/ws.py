"""WebSocket endpoint for real-time optimizer progress streaming."""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.models.optimization import OptimizationRequest, OptimizationProgress
from src.simulation.optimizer import run_optimization

logger = logging.getLogger("antsim.api.ws")

router = APIRouter()


@router.websocket("/ws/optimize")
async def optimizer_ws(websocket: WebSocket) -> None:
    """WebSocket endpoint for optimizer with real-time progress.

    Protocol:
    1. Client connects
    2. Client sends JSON optimization request (same schema as POST /optimize)
    3. Server streams JSON progress messages: {type: "progress", data: {...}}
    4. Server sends final result: {type: "result", data: {...}}
    5. Connection closes

    Client can close the connection at any time to cancel the optimization.
    """
    await websocket.accept()

    try:
        # Receive optimization request
        raw = await websocket.receive_json()
        request = OptimizationRequest(**raw)

        logger.info(
            "WS optimizer: %d variables, %s objective, max %d iterations",
            len(request.variables),
            request.objective,
            request.max_iterations,
        )

        # Shared state between the blocking optimizer thread and async WS sender
        progress_queue: asyncio.Queue[OptimizationProgress] = asyncio.Queue()
        cancelled = asyncio.Event()

        def on_progress(progress: OptimizationProgress) -> None:
            """Called from the optimizer thread for each iteration."""
            if cancelled.is_set():
                # Raise to abort scipy.optimize.minimize
                raise InterruptedError("Optimization cancelled by client")
            try:
                progress_queue.put_nowait(progress)
            except asyncio.QueueFull:
                pass  # Drop if queue is full (shouldn't happen)

        # Run optimizer in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()

        async def send_progress() -> None:
            """Drain progress queue and send to client."""
            while True:
                try:
                    progress = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    await websocket.send_json({
                        "type": "progress",
                        "data": progress.model_dump(),
                    })
                except TimeoutError:
                    pass  # No progress yet, keep waiting
                except (WebSocketDisconnect, RuntimeError):
                    cancelled.set()
                    return

        # Start progress sender as a task
        sender_task = asyncio.create_task(send_progress())

        try:
            # Run the blocking optimizer in a thread
            result = await loop.run_in_executor(
                None,
                lambda: run_optimization(request, on_progress=on_progress),
            )

            # Cancel the sender task
            sender_task.cancel()
            try:
                await sender_task
            except asyncio.CancelledError:
                pass

            # Drain any remaining progress messages
            while not progress_queue.empty():
                progress = progress_queue.get_nowait()
                await websocket.send_json({
                    "type": "progress",
                    "data": progress.model_dump(),
                })

            # Send final result
            await websocket.send_json({
                "type": "result",
                "data": result.model_dump(),
            })

        except InterruptedError:
            logger.info("WS optimizer cancelled by client")
            sender_task.cancel()
            try:
                await sender_task
            except asyncio.CancelledError:
                pass

        await websocket.close()

    except WebSocketDisconnect:
        logger.info("WS optimizer: client disconnected")
    except Exception as e:
        logger.error("WS optimizer error: %s", e)
        try:
            await websocket.send_json({
                "type": "error",
                "data": {"message": str(e)},
            })
            await websocket.close()
        except Exception:
            pass
