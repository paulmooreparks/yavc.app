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

## Automatic restart after a host reboot

The production Compose file sets `restart: unless-stopped` on both `yavc` and `tunnel`. Docker restores running containers when its daemon starts after a reboot. A container stopped manually stays stopped until it is started again. These policies are described in [Docker's restart documentation](https://docs.docker.com/engine/containers/start-containers-automatically/).

Enable Docker and containerd at boot, following [Docker's systemd setup](https://docs.docker.com/engine/install/linux-postinstall/):

```bash
sudo systemctl enable docker.service containerd.service
sudo systemctl is-enabled docker.service containerd.service
sudo docker inspect --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}} {{.State.Status}}' yavc-app yavc-tunnel
```

Both services should report `enabled`, and both containers should report `unless-stopped running`. Run these commands against the installed server configuration; the repository's Compose file does not prove what is currently running on the host. If either container is stopped, start the stack with `cd /opt/yavc && sudo docker compose up -d` before the reboot. Do not run `docker compose down` as preparation for a reboot, since that removes the containers whose policies Docker would use.

After reconnecting following a reboot, verify the stack and its tunnel:

```bash
cd /opt/yavc
sudo docker compose ps
sudo docker compose logs --tail=30 tunnel
curl -fsSI https://yavc.app/
```

No boot-time pull is needed. The existing containers use the installed image tag from the last deployment.

## The tunnel, once

The tunnel is managed in the Cloudflare dashboard, and the server holds only its token.

1. In the Cloudflare dashboard, open **Networking**, then **Tunnels** (they moved out of Zero Trust in 2026), and choose **Create a tunnel**.
2. Name it `yavc-linode` and create it.
3. On the install page choose **Docker**. The command shown ends in `--token` followed by a long string beginning `eyJ`. Copy only that string into `TUNNEL_TOKEN=` in `/opt/yavc/.env`, with no quotes or spaces. The safest way is to paste it at a hidden prompt: `read -rs T; sed -i "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=${T}|" .env; unset T`. A token changed after the container was made needs `sudo docker compose up -d --force-recreate tunnel`, since a plain restart keeps the old one.
4. On the tunnel's **Routes** tab, add three published applications, each with the service URL `http://yavc:8400`, which is the engine's name on the compose network. The protocol is required.
   - `yavc.app` (no subdomain)
   - `www.yavc.app`
   - `*.yavc.app`

   A tunnel with no routes answers 503 to everything and logs "No ingress rules were defined". The dashboard cannot create a route's DNS record while another record for the same name exists, so routes are added at the cut-over below.

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

Then point DNS at the new tunnel. The site needs only three records in the yavc.app zone, each a proxied CNAME to `<new id>.cfargotunnel.com`, where the new id is shown on the `yavc-linode` tunnel's page: `yavc.app`, `www` and `*`. Delete any record for a single applet's subdomain, such as `editor` or `files`, that an older setup made, because a specific record beats the wildcard and would keep sending that name to the old tunnel. Then add the three routes from the tunnel section above. Changes take effect within a minute or so because the records are proxied.

The cut-over on 3 November 2026 switched DNS before moving the sessions, so readers started with fresh sessions on the Linode. Moving the sessions first, as above, avoids that.

Check from anywhere that the site answers and that the new server served it, for example by loading `https://yavc.app/` and watching `sudo docker compose logs -f yavc` on the server. When it is confirmed, delete `yavc-data.tgz` on the workstation. The workstation's container can then be started again as staging at another address, or left stopped.

## Trying a branch before it is merged

A branch can be tried on the workstation in the same image the server runs, built from the branch and started on the workstation's own address. This also tests the image build, which CI does not do, since only a release tag builds the image. From the repository folder, with Docker Desktop running, fetch the branch and check it out without making a local branch of it:

```bash
git fetch origin BRANCH
git switch --detach FETCH_HEAD
```

Build the image and start it on port 8401:

```bash
docker build -t yavc-app:test .
docker run --rm -p 127.0.0.1:8401:8400 yavc-app:test -domain localhost
```

The desktop is then at `http://localhost:8401`, and each application on its own at its name before `localhost`, such as `http://editor.localhost:8401`. Chrome, Edge and Firefox send every name under `localhost` to the workstation itself, so nothing needs setting up. The image's own command would serve `yavc.app` over HTTPS only, which a browser cannot reach on this address, so the run gives it `-domain localhost` and leaves out `-secure`.

The reader's files and settings are kept per address, so `localhost:8401` starts empty and leaves everything on yavc.app alone. Sessions are kept inside the container, and Ctrl+C stops it and discards them. Afterwards, return to the main branch:

```bash
git switch main
```

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
- Removing yavc.app from the workstation's own tunnel, which no longer serves it.

The Cloudflare cache rule "Versioned assets" (Rules, Cache Rules) makes every path starting `/static/`, `/pudl/` or `/applets/` eligible for the edge cache and respects the engine's headers, so the 7 MB Markdown engine and the rest are served by Cloudflare. Without it, Cloudflare does not cache WebAssembly, and every reader fetched the engine from Chicago.
