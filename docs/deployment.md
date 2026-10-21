# Deployment Guide - Array Database Platform

## 1. Local Development
```bash
# Clone and run
npm install
npm run dev

# Run full test suite
npm test

# Run CLI
node bin/array.js --help
```

## 2. Vercel Deployment
Array is ready for single-command deployment to Vercel:

1. Connect your repository to Vercel.
2. In the Vercel Project Settings, configure Environment Variables:
   - `ARRAY_PROVIDER`: `github` (or `local` for ephemeral test instances)
   - `ARRAY_GITHUB_OWNER`: Your GitHub username or organization
   - `ARRAY_GITHUB_REPO`: The repository storing your data
   - `ARRAY_GITHUB_BRANCH`: `main`
   - `ARRAY_GITHUB_TOKEN`: GitHub Personal Access Token (`repo` scope for private repos)
3. Set Build Command: `npm run build`
4. Set Output Directory: `dist`
5. Deploy!

## 3. GitHub Storage Repository Setup
For production use with GitHub storage:
1. Create a dedicated repository (e.g. `my-org/array-data-store`). It can be private.
2. Create a fine-grained Personal Access Token with Read & Write permissions for Repository Contents and Git References.
3. Configure the token in your backend environment (`ARRAY_GITHUB_TOKEN`).
4. Initialize with `node bin/array.js init` or visit the Array Dashboard Settings screen.
