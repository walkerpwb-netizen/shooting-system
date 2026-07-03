<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project workflow

Do not start or offer local preview servers for routine changes. This project is worked on directly on the server.

After every completed change, create a git commit and push it to the configured remote branch.

After every push, monitor the full server/deployment process until the application is running correctly, then tell the user they can start testing.
<!-- END:nextjs-agent-rules -->
