# Running Amehnities on your own server

The web app is a static site. Hosting it yourself removes the "Edit with Lovable" badge.
Sign-in, the database, file storage and server functions keep running on the existing hosted backend, so no data moves.

## 1. Get the code
Download or clone the project from GitHub onto the server.

## 2. Build and run with Docker
```bash
docker build \
  --build-arg VITE_SUPABASE_URL="<value from .env>" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<value from .env>" \
  --build-arg VITE_SUPABASE_PROJECT_ID="<value from .env>" \
  -t amehnities .
docker run -d --restart unless-stopped -p 80:80 --name amehnities amehnities
```
These three values are public (safe to ship in the browser) and are listed in the project's `.env` file.

Without Docker: `npm install && npm run build`, then serve the `dist/` folder with any web server using `nginx.conf` (every unknown path must return `index.html`).

## 3. HTTPS and domain
Put the container behind HTTPS (for example Caddy, or nginx + Let's Encrypt), then point `www.amehnities.org` DNS to your server and remove the domain from Lovable's publish settings.

## 4. Sign-in redirects
Add `https://www.amehnities.org` to the allowed sign-in redirect addresses (Lovable Cloud → Users → Auth settings) so email links and Google sign-in return to your server.

## 5. Updates
Rebuild and restart the container after pulling new code.
