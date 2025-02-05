import express from 'express';
import path from "path";
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
app.use(cors({
  origin: 'http://localhost:5173',  // Erlaube Frontend-URL
  methods: ['GET', 'POST']
}));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

const activeProcesses = new Map();
const socketUserMap = new Map();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

io.on('connection', (socket) => {
  console.log('Client verbunden');

  socket.on('register', (userId) => {
    if (!userId) return;
    socketUserMap.set(socket.id, userId);
    console.log(`Client registriert: ${userId}`);
    const userDir = path.join(__dirname, userId);
    fs.mkdirSync(userDir, { recursive: true });
  })

  socket.on('startBackend', async (work_orders) => {
    const userId = socketUserMap.get(socket.id);
    if (!userId) return;
    
    const userDir = path.join(__dirname, userId);

    fs.rmdirSync(userDir, { recursive: true });
    fs.mkdirSync(userDir, { recursive: true });
    fs.mkdirSync(path.join(userDir, 'pdfs'), { recursive: true });
    fs.mkdirSync(path.join(userDir, 'work_orders'), { recursive: true });
    fs.mkdirSync(path.join(userDir, 'old_pdfs'), { recursive: true });

    app.use(`/pdfs/${userId}`, express.static(path.join(userDir, 'pdfs')));
    const process = await loadScraper(work_orders, socket, userDir);
    activeProcesses.set(userId, process);
  });

  socket.on('disconnect', () => {
    if (!socketUserMap.has(socket.id)) return;
    console.log('Client getrennt');
    const userId = socketUserMap.get(socket.id);
    socketUserMap.delete(socket.id);
    // Verzögertes Löschen (10 Sekunden warten)
    if (Array.from(socketUserMap.values()).includes(userId)){
      console.log(socketUserMap.values());
    }
    setTimeout(() => {
      if (!Array.from(socketUserMap.values()).includes(userId)) {
        console.log(`Lösche Daten für: ${userId}`);
        const userDir = path.join(__dirname, userId);
        fs.rmdirSync(userDir, { recursive: true });
        activeProcesses.delete(userId);
      }
    }, 4000);
    }
  )
});


async function loadScraper(work_orders, socket, userDir) {
  const { scrapeData } = await import('./run-process-scraping.js');
  await scrapeData(work_orders, socket, userDir);
}


app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;

    const userId = req.query.userId;
    const userDir = path.join(__dirname, userId);
    
    const filePath = path.join(userDir, 'pdfs', filename);

    res.download(filePath, filename, (err) => {
      if (err) {
        res.status(500).send('Datei konnte nicht heruntergeladen werden');
      }
    });
});

app.get('/pdfs/:filename', (req, res) => {
    const filename = req.params.filename;

    const userId = req.query.userId;
    const userDir = path.join(__dirname, userId);
    
    const filePath = path.join(userDir, 'pdfs', filename);

    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(500).send('Datei konnte nicht angezeigt werden');
      }
    });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`Server at http://localhost:${port}`);
});
