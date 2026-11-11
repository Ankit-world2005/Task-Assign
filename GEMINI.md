# US24 Solutions — Task Assign System Directives

## 1. Mandatory Git Push & Multi-Environment Policy (STRICT)
- **Rule 1 — Dev First (Always)**: ALL code changes, updates, fixes, and new features MUST FIRST be committed and pushed to the **`dev`** environment branch of the GitHub repositories (`Ankit-world2005/US24_Task_Assign` and `Ankit-world2005/Task-Assign`).
- **Rule 2 — Sequential Environment Progression**: Never push directly to subsequent environments (`uat`, `main` / production) skipping `dev`. Only after changes have landed and been verified in the `dev` environment can they proceed to further branches/environments.
- **Rule 3 — Production Gate**: The **`main`** branch is strictly reserved for verified production releases. Pushes to `main` trigger automated production deployment on Vercel.

### Standard Git Workflow:
```bash
# 1. Always develop and commit on dev
git checkout dev
git add -A
git commit -m "feat/fix: <description>"

# 2. Step 1: PUSH TO DEV FIRST
git push us24 dev
git push origin dev

# 3. Step 2: Only proceed to further environments (UAT / Main) after verification
# (e.g. promoting dev -> uat or dev -> main when instructed)
```

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
