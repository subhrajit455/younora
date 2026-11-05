# Younora Luxury Fashion — Backend API

Modular monolith backend API for the Younora Luxury Fashion E-Commerce Platform.

## Quick Start (under 5 minutes)

### Prerequisites
- Node.js 20+ (LTS)
- MongoDB running locally on port 27017 or a MongoDB Atlas connection string

### Setup & Run
1. From the repository root, install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file (if not present):
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   ```
3. Run dev server:
   ```bash
   npm run dev:backend
   ```
4. Verify health:
   ```bash
   curl http://localhost:5000/api/v1/health
   ```

### Tests
Run all automated tests:
```bash
npm run test:backend
```

