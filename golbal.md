# Server Infrastructure & Remote Deployment Guidelines (global.md)

See full documentation in [global.md](file:///C:/Users/DELL/elite-motors/global.md).

## 1. Remote Server Access Specification
- **SSH Target Alias**: `godaddy`
- **User**: `newproj`
- **Privileges**: Full passwordless sudo (`sudo <command>`)
- **Environment**: AlmaLinux 10 with cPanel
- **Host Configuration**: Configured in `~/.ssh/config` (`Host godaddy -> 97.74.95.101`, IdentityFile `~/.ssh/id_ed25519`)

## 2. Remote Command Execution & File Transfer
- **Remote Commands**: Execute remote commands via:
  ```bash
  ssh godaddy '<command>'
  ```
- **File Uploads**: Transfer files via SCP:
  ```bash
  scp <local-file> godaddy:~/.
  ```

## 3. STRICT SAFETY CONSTRAINT & BOUNDARY RULE
> [!CAUTION]
> **DO NOT TOUCH `/home/damaplus1` OR ANYTHING RELATED TO DAMAPLUS.**
> - Never view, read, modify, delete, overwrite, or touch `/home/damaplus1` or any files/directories belonging to the Damaplus tenant/user.
> - All new project deployments, scripts, builds, and operations must remain strictly confined to `/home/newproj` (or designated system service paths outside of `/home/damaplus1`).
