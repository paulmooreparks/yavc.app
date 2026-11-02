# Deploying yavc.app

yavc.app runs on a Linode Shared CPU 2 GB server in Chicago (us-ord), Ubuntu 24.04 LTS, behind Cloudflare (DESIGN.md, decision 23). The server accepts SSH from Paul's address and nothing else. The site reaches the internet through a Cloudflare tunnel that the server opens outward, so no web port is ever open on it. The workstation keeps running the site from source as a staging copy.

A release is a git tag such as `v0.1.0`. Pushing the tag runs `.github/workflows/image.yml`, which runs the checks and publishes the image `ghcr.io/paulmooreparks/yavc.app:v0.1.0`. The server runs whatever tag its `.env` file says, so deploying is changing that line and restarting, and rolling back is putting the previous tag back.

## The server, once

The server was created with Paul's `yavc_linode` SSH key, the `yavc-fw` cloud firewall (inbound drop, SSH from Paul's address only), an admin user `paul` with sudo, root and password logins off, and automatic security updates that reboot at 04:00 UTC when needed.

Install Docker from Docker's own repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world
```

Docker commands are run with `sudo`. Adding `paul` to the `docker` group would save typing, but membership of that group is equivalent to root, so it is left out.

Make the site's folder and fetch the compose file and the environment template from the repository:

```bash
sudo install -d -m 750 -o paul -g paul /opt/yavc
cd /opt/yavc
curl -fsSLO https://raw.githubusercontent.com/paulmooreparks/yavc.app/main/deploy/compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/paulmooreparks/yavc.app/main/deploy/env.example
chmod 600 .env
```

## The tunnel, once

The tunnel is managed in the Cloudflare dashboard, and the server holds only its token.

1. In the Cloudflare dashboard, open **Zero Trust**, then **Networks**, then **Tunnels**, and choose **Create a tunnel**.
2. Choose **Cloudflared**, name it `yavc-linode`, and save.
3. On the install page choose **Docker**. The command shown ends in `--token` followed by a long string. Copy only that string into `TUNNEL_TOKEN=` in `/opt/yavc/.env`.
4. Add the published routes (called public hostnames in older versions of the dashboard). Each one uses the service type **HTTP** and the address `yavc:8400`, which is the engine's name on the compose network.
   - `yavc.app`
   - `www.yavc.app`
   - `*.yavc.app`

   The dashboard cannot create a route's DNS record while the old tunnel's record for the same name exists. Leave those records alone until the cut-over below, and add any route the dashboard refuses at that point instead.

## The first release

On the workstation, tag the commit and push the tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

When the **image** workflow finishes, open the package on GitHub (the repository's **Packages**, then `yavc.app`, then **Package settings**) and set its visibility to **Public**, once, so the server can pull it without a token. The repository is public already.

On the server, set `YAVC_TAG=v0.1.0` in `.env`, then start the site and look at it from inside the server:

```bash
cd /opt/yavc
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
sudo docker run --rm --network yavc_default alpine wget -qO- --header 'Host: yavc.app' http://yavc:8400/ | head -5
sudo docker compose logs tunnel | tail -5
```

The `wget` line should print the start of the desktop's HTML, and the tunnel's log should say it registered connections. The site is now reachable through the new tunnel, but DNS still sends readers to the workstation.

## The cut-over

Move the sessions first, so readers keep their settings and state. On the workstation, in PowerShell from the repository folder:

```powershell
docker compose stop
docker run --rm -v yavcapp_yavc-data:/data -v "${PWD}:/out" alpine tar czf /out/yavc-data.tgz -C /data .
scp -i "$env:USERPROFILE\.ssh\yavc_linode" yavc-data.tgz paul@172.239.52.175:/tmp/
```

On the server:

```bash
cd /opt/yavc
sudo docker compose stop yavc
sudo docker run --rm -v yavc-data:/data -v /tmp:/in alpine sh -c 'tar xzf /in/yavc-data.tgz -C /data && chown -R 1000:0 /data'
sudo docker compose start yavc
rm /tmp/yavc-data.tgz
```

Then point DNS at the new tunnel. In the yavc.app zone's **DNS** records, the records for `yavc.app`, `www` and `*` are CNAMEs to the old tunnel's address, `<old id>.cfargotunnel.com`. Edit each one to `<new id>.cfargotunnel.com`, where the new id is shown on the `yavc-linode` tunnel's page, and keep each one proxied. Changes take effect within a minute or so because the records are proxied.

Check from anywhere that the site answers and that the new server served it, for example by loading `https://yavc.app/` and watching `sudo docker compose logs -f yavc` on the server. When it is confirmed, delete `yavc-data.tgz` on the workstation. The workstation's container can then be started again as staging at another address, or left stopped.

## Deploying and rolling back

To deploy, push a new tag from the workstation, wait for the workflow, then on the server:

```bash
cd /opt/yavc
sed -i 's/^YAVC_TAG=.*/YAVC_TAG=v0.1.1/' .env
sudo docker compose pull && sudo docker compose up -d
```

To roll back, do the same with the previous tag. Sessions are kept in the `yavc-data` volume, so neither changes them.

## Still to do

- Nightly copies of the `yavc-data` volume to Cloudflare R2, which needs an R2 bucket and an access key with write access to it only.
- The Cloudflare cache rule that makes `/static/`, `/pudl/` and `/applets/` eligible for the edge cache, so the 7 MB Markdown engine is served by Cloudflare rather than the server.
