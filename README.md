# cornhole
Cornhole scorekeeper

## Features
- Track scores for two teams
- Change team names
- Customize team background colors with a rainbow palette
- Reset scores

## Development

### Prerequisites
- Node.js (version 14 or higher)
- npm

### Installation
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

### Running Locally
Start the development server:
```
npm start
```
The app will be available at `http://localhost:3000/cornhole`.

### Building
Create a production build:
```
npm run build
```
The build artifacts will be stored in the `build/` directory.

### Deploying to GitHub Pages
Deploy the app to GitHub Pages:
```
npm run deploy
```
This will build the app and push the `build` folder to the `gh-pages` branch of your repository. The app will be live at `https://zazaj.github.io/cornhole`.

**Note:** Ensure the `homepage` field in `package.json` matches your GitHub Pages URL.
