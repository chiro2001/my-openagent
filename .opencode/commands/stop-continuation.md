Stop all continuation mechanisms for the current session.

This command will:
1. Stop the todo-continuation-enforcer from automatically continuing incomplete tasks
2. Cancel any active background tasks
3. Clear continuation state for this session

After running this command:
- The session will not auto-continue when idle
- Background tasks will be cancelled
- You can manually continue work when ready
- Use /start-work to resume automated continuation
