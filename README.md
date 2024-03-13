# Running Prompt-Explorer

1. Create a `data` directory in this folder; this will contain your prompts, inputs, and outputs. (You can also name this folder anything you like, and prefix the `node server/server.js` command later with `DATA_DIR=path-to-folder`, e.g., `DATA_DIR=data-experiment-1 node server/server.js`.
2. Install dependencies with `npm install`
3. Create a ``.env.local` file (parallel to the existing `.env`) containing the line `OPENAI_API_KEY=sk-XXXYYYZZZ` -- replace `sk-XXXYYYZZZ` with your OpenAI API secret key.
4. For production use, run `npm run build` to compile the react frontend (into the `build` folder); for development, run `npm start` to start the hot-loading frontend server.
5. Run the server. `node server/server.js` Default port is http://localhost:8201/ for production; https://localhost:3000/ for frontend -- both these will be reported in the console.
