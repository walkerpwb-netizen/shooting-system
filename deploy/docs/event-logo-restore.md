# Event logo assets

Event logo originals remain in the competition records and are included in the
PostgreSQL backup. Public logo files in `backend/uploads/event-logos` are
derived copies named by SHA-256. After restoring the database to the application
server, regenerate them before opening the site to traffic:

```bash
cd /home/ubuntu/shooting-system/backend
venv/bin/python scripts/restore_event_logos.py
```

This reads the restored database and writes missing files; it does not update
records. A normal event detail request also regenerates missing files, but the
explicit restore ensures old image URLs work before the event is visited.
Keep generated files during deployment. Logo uploads accept JPEG, PNG, GIF or
WebP up to 6 MiB; assets are served with a one-year immutable cache policy.
