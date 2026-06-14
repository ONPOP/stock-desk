// Electron 메인 — Next.js standalone 서버를 내부에서 띄우고 창에 로드한다.
// 사용자는 .app 더블클릭만 하면 되고, 로컬에서 next 서버가 자동 실행/종료된다.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { fork } = require('child_process');

let serverProcess = null;
let mainWindow = null;

// 패키징 여부에 따라 standalone 서버·env 파일 경로를 결정한다.
function resolvePaths() {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      server: path.join(res, 'standalone', 'server.js'),
      cwd: path.join(res, 'standalone'),
      envFile: path.join(res, 'app.env'),
    };
  }
  const root = path.join(__dirname, '..');
  return {
    server: path.join(root, '.next', 'standalone', 'server.js'),
    cwd: path.join(root, '.next', 'standalone'),
    envFile: path.join(root, '.env.local'),
  };
}

// .env 파일을 직접 파싱한다(dotenv 의존성 없이). 시세/DB 시크릿을 서버에 주입하기 위함.
function loadEnv(envFile) {
  const env = {};
  try {
    const text = fs.readFileSync(envFile, 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  } catch {
    // env 파일이 없으면 그대로 진행(앱이 시세/DB 접근 시 안내 에러로 처리됨)
  }
  return env;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/login' }, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Next 서버 시작 시간 초과'));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function startServer() {
  const { server, cwd, envFile } = resolvePaths();
  const port = await getFreePort();
  const env = loadEnv(envFile);
  serverProcess = fork(server, [], {
    cwd,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  serverProcess.stdout?.on('data', (d) => console.log('[next]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[next]', d.toString().trim()));
  await waitForServer(port);
  return port;
}

async function createWindow() {
  let port;
  try {
    port = await startServer();
  } catch (e) {
    console.error('서버 시작 실패:', e);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    title: 'Stock Desk',
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // 외부 링크(원문 뉴스 등)는 시스템 기본 브라우저로 연다.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function shutdown() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.on('window-all-closed', () => {
  shutdown();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', shutdown);
