import express from 'express';
import cors from 'cors';
import http from 'http';

import { ORIGENS_PERMITIDAS, ADMIN_USER, PORT, salas} from './project_lib/init.js';
import { verificarSenha } from './project_lib/helpers.js'

import SocketManager from './socket.js';


export const app = express();

const server = http.createServer(app);

const socket = new SocketManager(server);

const io = socket.getTheIo();

socket.start();

// CORS para rotas HTTP (Express)
app.use(cors({
    origin: ORIGENS_PERMITIDAS,
    methods: ['GET', 'POST']
}));

app.use(express.json());
// --- Rota de health check (Railway verifica se está rodando) ---
app.get('/', (req, res) => {
    res.json({ status: 'GitWil API rodando', timestamp: new Date().toISOString() });
});

// TODO LIMITAÇÃO que permanece: se dois professores estiverem com salas abertas
// ao mesmo tempo, o aluno sem código ainda pode cair na sala errada.!!!!
app.get('/api/sala-ativa', (req, res) => {
    for (const codigo of Object.keys(salas)) {
        const criadorConectado = io.sockets.sockets.has(salas[codigo].criadorSocketId);
        if (!criadorConectado) {
            delete salas[codigo];
            console.log(`Sala fantasma ${codigo} removida por /api/sala-ativa.`);
        }
    }

    const codigosRestantes = Object.keys(salas);
    res.json({ codigo: codigosRestantes.length > 0 ? codigosRestantes[0] : null });
});

app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === ADMIN_USER && verificarSenha(senha)) {
        res.json({ sucesso: true });
    } else {
        res.status(401).json({ sucesso: false, mensagem: "Credenciais inválidas" });
    }
});

app.get('/qtd_respostas', (req, res) => {

    const codigo = req.query.codigo;

    res.send(salas[codigo].total_votos);
});

server.listen(PORT, () => {
    console.log(`GitWil API rodando na porta ${PORT}`);
});