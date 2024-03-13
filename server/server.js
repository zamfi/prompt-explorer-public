const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
const { log } = require('console');

require('dotenv').config({ path: `.env.local` });


const DATA_DIR = process.env.DATA_DIR || 'data';
const PROMPT_DIR = process.env.PROMPT_DIR || path.join(DATA_DIR, 'prompts');
const TEXT_DIR = process.env.TEXT_DIR || path.join(DATA_DIR, 'texts');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(DATA_DIR, 'outputs');
const DIRS = {
  prompts: PROMPT_DIR,
  texts: TEXT_DIR,
  outputs: OUTPUT_DIR
}
const BUILD_DIR = process.env.BUILD_DIR || 'build';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY // qian's key
});

const openai = new OpenAIApi(configuration);

const server = http.createServer(async (req, res) => {
  async function getBody(req) {
    if (req.method !== 'POST') return;
    let body = [];
    for await (const chunk of req) {
      body.push(chunk);
    }
    return Buffer.concat(body).toString();
  }
  const body = await getBody(req);

  const data = body ? JSON.parse(body) : {};

  if (req.url === '/api') {
    const {prompt, text, model = 'gpt-4', temperature = 0} = data;

    try {
      console.log("requesting critique for", prompt, "\n//\n", text);
      const gptResponse = await openai.createChatCompletion({
        model, temperature,
        messages: [
          {role: 'system', content: prompt},
          {role: 'user', content: text}
        ]
      });

      res.end(JSON.stringify({output: gptResponse.data.choices[0].message.content}));
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.end('An error occurred');
    }
  } else if (req.url === '/save') {
    const sanitize = {
      prompt: (str) => str.replace(/[^a-zA-Z0-9]/g, '_'),
      text: (str) => str.replace(/[^a-zA-Z0-9]/g, '_'),
      output: (str) => str.replace(/[^a-zA-Z0-9|]/g, '_')
    };
    // console.log("saving", data);
    const {label, content, type} = data;
    const fileName = path.join(DIRS[type+'s'], sanitize[type](label) + '.txt');
    await fs.writeFile(fileName, content, {encoding: 'utf-8', flag: type === 'output' ? 'a' : 'w'});
    res.end('File saved');

  } else if (req.url === '/load') {
    const {label, type} = data;
    const fileName = path.join(DIRS[type+'s'], label.replace(/[^a-zA-Z0-9]/g, '_') + '.txt');
    let content;
    try {
      content = await fs.readFile(fileName, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        content = '';
      } else {
        throw error;
      }
    }

    res.end(JSON.stringify({label, content}));

  } else if (req.url === '/rename') {
    const {oldLabel, newLabel, type, content} = data;
    const oldFileName = path.join(DIRS[type+'s'], oldLabel.replace(/[^a-zA-Z0-9]/g, '_') + '.txt');
    const newFileName = path.join(DIRS[type+'s'], newLabel.replace(/[^a-zA-Z0-9]/g, '_') + '.txt');
    try {
      await fs.rename(oldFileName, newFileName);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.writeFile(newFileName, content);
      } else {
        throw error;
      }
    }
    if (type !== 'output') {
      // find all output files that reference this label type and rename them
      const files = await fs.readdir(OUTPUT_DIR);
      const test = (file) => path.extname(file) === '.txt' && type === 'prompt' ? file.includes(`|${oldLabel}.`) : file.startsWith(`${oldLabel}|`);
      const rename = (file) => type === 'prompt' ? file.replace(`|${oldLabel}.`, `|${newLabel}.`) : file.replace(`${oldLabel}|`, `${newLabel}|`);
      for (const file of files) {
        if (path.extname(file) === '.txt' && test(file)) {
          const oldFileName = path.join(OUTPUT_DIR, file);
          const newFileName = path.join(OUTPUT_DIR, rename(file));
          await fs.rename(oldFileName, newFileName);
        }
      }
    }
    res.end(JSON.stringify({status: 'ok'}));

  } else if (req.url === '/loadAll') {
    // make sure all directories exist
    try {
      await fs.mkdir(DATA_DIR);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    for (const dir of Object.values(DIRS)) {
      try {
        await fs.mkdir(dir);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    // load up all prompt, text, and output filenames w/ associated data
    const files = {
      prompts: await fs.readdir(PROMPT_DIR),
      texts: await fs.readdir(TEXT_DIR),
      outputs: await fs.readdir(OUTPUT_DIR)
    }
    const allFilesData = {
      prompts: {},
      texts: {},
      outputs: {}
    };
    for (const type in files) {
      for (const file of files[type]) {
        if (path.extname(file) === '.txt') {
          const label = file.slice(0, -4);
          const fileName = path.join(DIRS[type], file);
          const content = await fs.readFile(fileName, 'utf-8');
          allFilesData[type][label] = content;
        }
      }
    }
    res.end(JSON.stringify(allFilesData));

  } else {
    // Serve any files requested from the build folder
    let url = req.url;
    // sanitize url to prevent directory traversal attacks
    url = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');

    if (url === '/') url = '/index.html';

    const filePath = path.join(BUILD_DIR, url);
    try {
      const fileContent = await fs.readFile(filePath);
      res.end(fileContent);
    } catch (error) {
      console.error(error);
      res.statusCode = 404;
      res.end('File not found');
    }
  }
});

const PORT = process.env.PORT || 8201;
console.log(`Server listening on port ${PORT}`);
server.listen(PORT);
