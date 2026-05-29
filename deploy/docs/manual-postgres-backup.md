# Manual PostgreSQL Backup Download

Use this when the current offsite-backup mode is manual download through an SSH session.

1. Generate a temporary SSH key and add the public key to `/home/ubuntu/.ssh/authorized_keys`.

2. Check the newest backup on the VPS:

```bash
ssh -i /path/to/temp-key -o IdentitiesOnly=yes ubuntu@192.99.43.63 \
  'cd /home/ubuntu/shooting-system && deploy/scripts/latest-postgres-backup.sh'
```

3. Download the `path=` returned by the command:

```bash
mkdir -p shooting-system/.server-backups/postgres-manual-YYYYMMDD

scp -i /path/to/temp-key -o IdentitiesOnly=yes \
  ubuntu@192.99.43.63:/home/ubuntu/backups/shooting-system/postgres/shooting-system-YYYYMMDDTHHMMSSZ.dump \
  shooting-system/.server-backups/postgres-manual-YYYYMMDD/
```

4. Verify the downloaded file checksum:

```bash
shasum -a 256 shooting-system/.server-backups/postgres-manual-YYYYMMDD/shooting-system-YYYYMMDDTHHMMSSZ.dump
```

The hash must match the `sha256=` value from the VPS.

5. Remove the temporary public key from `/home/ubuntu/.ssh/authorized_keys`, delete the local key pair, and confirm the removed key gets `Permission denied`.

The dump is created with `pg_dump --format=custom`, so restore checks can use:

```bash
pg_restore --list shooting-system-YYYYMMDDTHHMMSSZ.dump
```
