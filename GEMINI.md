# US24 Solutions — Task Assign System Directives

## 1. Git & Environment Branching Strategy
- **Development Branch (`dev`)**: All active code changes, features, and fixes MUST be committed and pushed to the `dev` branch on GitHub (`Ankit-world2005/US24_Task_Assign` and `Ankit-world2005/Task-Assign`).
- **Production Branch (`main`)**: The `main` branch is reserved for verified production releases. Pushes to `main` automatically deploy to the Vercel production environment.
- Always verify branches and push development work to `dev`.

## 2. Project Architecture & Local Runtime
- **Backend API**: Node.js + Express REST API running on port `8001` (`http://127.0.0.1:8001/api/`).
  - Start command: `cd Backend && npm start`
  - Test suite: `cd Backend && npm test`
- **Frontend App**: React 19 + Vite running on port `5173` (`http://localhost:5173/`).
  - Dev command: `cd Frontend && npm run dev`
  - Build command: `cd Frontend && npm run build`
- **One-Click Launcher**: `start.bat` launches both backend and frontend in separate consoles with automated dependency checks.

## 3. Production Environment (Vercel)
- **Project Name**: `us24_task_assign`
- **Live Production URL**: https://us24taskassign.vercel.app
- **Root Directory**: `Frontend`
- **Framework Preset**: `Vite`
- **Build Output**: `dist`

## 4. Authentication & Credentials
- **Two-Step Verification**: Sign-in requires password verification followed by a 6-digit OTP.
- **Administrator Accounts**:
  - `admin` / `admin@us24solutions.com` — Password: `admin123`
  - `ankitkumar87147@gmail.com` — Password: `123456`
- **Employee Accounts**:
  - `sourabh` (`sourabh@us24solutions.com`) — Password: `pass123`
  - `rohit` (`rohit@us24solutions.com`) — Password: `pass123`
  - `gautamtiwari@us24solutions.com` — Password: `pass123`
  - `manish` (`manish@us24solutions.com`) — Password: `pass123`
  - `jitendra` (`jitendra@us24solutions.com`) — Password: `pass123`
