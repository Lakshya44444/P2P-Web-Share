# P2P Web Share - Deployment Guide

## Quick Start (Local Development)

```bash
# Terminal 1: Backend
cd backend
npm install
npm start

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

Visit: `http://localhost:5173`

---

## Production Deployment

### Option 1: Vercel (Frontend) + Render (Backend)

#### Backend Deployment on Render

1. **Create Render Account**: https://dashboard.render.com

2. **Create New Web Service**:
   - Name: `p2p-share-backend`
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free or Starter

3. **Environment Variables**:
   ```
   PORT=3001
   FRONTEND_URL=https://your-frontend-domain.vercel.app
   NODE_ENV=production
   ```

4. **Deploy**: Push to GitHub, Render auto-deploys

#### Frontend Deployment on Vercel

1. **Create Vercel Account**: https://vercel.com

2. **Import Project**:
   - Select `frontend` directory
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Environment Variables**:
   ```
   VITE_BACKEND_URL=https://p2p-share-backend.onrender.com
   ```

4. **Deploy**: Auto-deploy on push to main

---

### Option 2: Railway (Backend) + Netlify (Frontend)

#### Backend on Railway

1. **Create Railway Account**: https://railway.app

2. **New Project > GitHub Repo**:
   - Select your repository
   - Services: Node.js

3. **Environment Variables**:
   ```
   PORT=$PORT (auto-set by Railway)
   FRONTEND_URL=https://your-netlify-domain.netlify.app
   NODE_ENV=production
   ```

4. **Deploy Domain**: Railway provides public URL

#### Frontend on Netlify

1. **Create Netlify Account**: https://netlify.com

2. **New Site from Git**:
   - Select `frontend` directory
   - Build Command: `npm run build`
   - Publish Directory: `dist`

3. **Environment Variables**:
   ```
   VITE_BACKEND_URL=https://your-railway-domain.up.railway.app
   ```

4. **Deploy**: Auto-deploy on push

---

### Option 3: Docker Deployment

#### Create Docker Container

```dockerfile
# backend/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Deploy with Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      FRONTEND_URL: http://localhost
    
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

---

## Environment Configuration

### Development (.env)

**Backend**:
```env
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Frontend**:
```env
VITE_BACKEND_URL=http://localhost:3001
```

### Production (.env)

**Backend**:
```env
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com
NODE_ENV=production
```

**Frontend**:
```env
VITE_BACKEND_URL=https://your-backend-domain.com
```

---

## Custom Domain Setup

### For Backend (Render/Railway)

1. Go to Settings > Domains
2. Add Custom Domain
3. Update DNS CNAME record:
   ```
   api.yourdomain.com CNAME your-render-url.onrender.com
   ```

### For Frontend (Vercel/Netlify)

1. Project Settings > Domains
2. Add Custom Domain
3. Update DNS records as instructed

### Update Environment Variables

After custom domain setup:

**Backend Environment**:
```
FRONTEND_URL=https://yourdomain.com
```

**Frontend Environment**:
```
VITE_BACKEND_URL=https://api.yourdomain.com
```

---

## Performance Optimization

### Backend Optimization

1. **Enable Compression**:
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

2. **Connection Pooling**: Configure Socket.io adapter for scaling
   ```javascript
   const { createAdapter } = require("@socket.io/redis-adapter");
   io.adapter(createAdapter(pubClient, subClient));
   ```

3. **Rate Limiting**:
   ```javascript
   const rateLimit = require("express-rate-limit");
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100
   });
   app.use(limiter);
   ```

### Frontend Optimization

1. **Build Optimization**: Vite automatically optimizes bundles
2. **Lazy Loading**: Implement code splitting for large components
3. **Image Optimization**: Use next-gen formats (WebP)
4. **Caching**: Set Cache-Control headers on CDN

---

## Monitoring & Logging

### Backend Monitoring

1. **Error Tracking**: Sentry integration
   ```javascript
   const Sentry = require("@sentry/node");
   Sentry.init({ dsn: process.env.SENTRY_DSN });
   ```

2. **Metrics**: New Relic or DataDog
   ```javascript
   const newrelic = require('newrelic');
   ```

3. **Logs**: Winston or Bunyan
   ```javascript
   const logger = require('winston');
   ```

### Frontend Monitoring

1. **Error Reporting**: Sentry SDK
2. **User Analytics**: Plausible or Mixpanel
3. **Performance Monitoring**: Web Vitals

---

## Scaling Considerations

### For High Traffic

1. **Backend Scaling**:
   - Use Redis adapter for Socket.io
   - Deploy multiple instances behind load balancer
   - Use message queue for tasks

2. **Frontend Scaling**:
   - Serve from CDN (Cloudflare)
   - Enable gzip compression
   - Implement service workers

3. **Database** (if added):
   - Use connection pooling
   - Implement caching layer (Redis)
   - Optimize queries

---

## Security Checklist

- [ ] Enable HTTPS/TLS on all domains
- [ ] Set CORS properly (whitelist origins)
- [ ] Implement rate limiting
- [ ] Add input validation
- [ ] Enable CSRF protection
- [ ] Set security headers (Helmet.js)
- [ ] Implement authentication (for future)
- [ ] Use environment variables for secrets
- [ ] Enable Web Crypto for hashing (already done)
- [ ] Regular security audits

---

## Troubleshooting Deployment

### WebRTC Connection Issues

1. Check STUN/TURN server configuration
2. Verify CORS settings match frontend domain
3. Check firewall rules for WebRTC ports

### Blank Frontend Page

1. Check `VITE_BACKEND_URL` is correct
2. Verify backend is accessible from frontend
3. Check browser console for errors
4. Clear cache and reload

### Backend Connection Timeout

1. Verify backend URL in frontend env
2. Check backend is running and accessible
3. Check firewall/security groups
4. Verify DNS resolution

### CORS Errors

Backend `server.js` CORS configuration:
```javascript
cors: {
  origin: [
    'https://yourdomain.com',
    'https://api.yourdomain.com'
  ],
  methods: ['GET', 'POST']
}
```

---

## Backup & Recovery

1. **Code**: Git repository (GitHub, GitLab)
2. **Configuration**: Store .env files securely (1Password, Vault)
3. **Database**: (if added) Regular automated backups
4. **Logs**: Archive logs regularly

---

## Cost Estimation (Monthly)

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Vercel Frontend | 100GB bandwidth | $20/month |
| Render Backend | 750 hours | $12/month |
| Netlify Alternative | 100GB bandwidth | Free |
| Railway Alternative | $5 credit | Pay-as-you-go |
| Cloudflare CDN | Free | $20/month |
| **Total** | Free | $50-100/month |

---

## Going Live Checklist

- [ ] Code reviewed and merged
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Custom domains set up
- [ ] SSL certificates installed
- [ ] Monitoring enabled
- [ ] Backup systems in place
- [ ] Documentation complete
- [ ] Team trained on deployment
- [ ] Rollback plan ready

---

## Support & Contact

For deployment issues:
- Email: support@yourdomain.com
- Issues: GitHub Issues
- Docs: README.md

