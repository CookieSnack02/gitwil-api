const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require("socket.io");

// Nao estava carregando os aquivos .env toda lugar que fazia usso do process.env havia um pipe "||" o que levava a um fall back 
// por isso adicionei essa biblioteca para que possamos trabalhar com Configurações de ambiente
require('dotenv/config');

const server = http.createServer(app);

// ============================================================
// CORS — Defina aqui os domínios que podem acessar o back-end
// ============================================================
const ORIGENS_PERMITIDAS = [
    'https://gitwil.com.br',
    'https://www.gitwil.com.br',
    
    // Para testes locais, descomente as linhas abaixo:
    // 'http://127.0.0.1:5500',
    // 'http://localhost:3030',
    // 'http://127.0.0.1:5500',
];

// CORS para rotas HTTP (Express)
app.use(cors({
    origin: ORIGENS_PERMITIDAS,
    methods: ['GET', 'POST']
}));

app.use(express.json());

// Socket.IO com CORS e WebSocket REAL (não mais long polling!)
const io = new Server(server, {
    cors: {
        origin: ORIGENS_PERMITIDAS,
        methods: ['GET', 'POST']
    }
    // Sem forçar 'polling' — agora usa WebSocket nativo por padrão
});

// --- Rota de health check (Railway verifica se está rodando) ---
app.get('/', (req, res) => {
    res.json({ status: 'GitWil API rodando', timestamp: new Date().toISOString() });
});

// --- Retorna o código da sala ativa (para QR Code estático) ---
// LIMITAÇÃO: retorna apenas a PRIMEIRA sala da lista.
// Se houver múltiplos professores com salas abertas ao mesmo tempo,
// alunos que entrarem pelo QR estático podem cair na sala errada.
// Funciona corretamente apenas quando há uma única sala ativa por vez.
app.get('/api/sala-ativa', (req, res) => {
    const codigos = Object.keys(salas);
    if (codigos.length > 0) {
        res.json({ codigo: codigos[0] });
    } else {
        res.json({ codigo: null });
    }
});

// --- SEGURANÇA ---
const crypto = require('crypto');

const ADMIN_USER = process.env.ADMIN_USER || "wilson";
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "df52552b4e09eb2a3e3cbb9b53b1d499260147c789e3b699b1e921252379672b";

function verificarSenha(senhaDigitada) {
    if (!senhaDigitada) return false;
    const hash = crypto.createHash('sha256').update(senhaDigitada).digest('hex');
    return hash === ADMIN_PASS_HASH;
}

app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    if (usuario === ADMIN_USER && verificarSenha(senha)) {
        res.json({ sucesso: true });
    } else {
        res.status(401).json({ sucesso: false, mensagem: "Credenciais inválidas" });
    }
});

// --- LÓGICA DO CÓDIGO ---
// ATENÇÃO: todo o estado das salas fica em memória RAM.
// Se o servidor Railway reiniciar (deploy, inatividade, crash), todas as salas
// são perdidas — professores com sessões ativas perderão os dados da aula.
// Solução definitiva exigiria persistência em banco de dados (ex: Redis, SQLite).
const salas = {};

function gerarCodigoAleatorio(qtdDigitos) {
    const digitos = Math.max(3, Math.min(10, qtdDigitos || 6));
    const min = Math.pow(10, digitos - 1);
    const max = Math.pow(10, digitos) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

function montarObjetoVotos(config) {
    const votos = {};
    if (config.tipoPergunta === 'certo_errado') {
        votos['Certo'] = 0;
        votos['Errado'] = 0;
    } else if (config.tipoPergunta === 'multipla_escolha') {
        const letras = ['A', 'B', 'C', 'D', 'E', 'Não sei'];
        const qtd = parseInt(config.qtdOpcoes) || 4;
        for (let i = 0; i < qtd; i++) {
            votos[letras[i]] = 0;
        }
    }
    return votos;
}

io.on('connection', (socket) => {
    const alunoId = socket.handshake.auth.alunoId || socket.id;

    socket.on('criar_sala', (opcoes) => {
        let codigo;

        if (opcoes && opcoes.codigoManual && opcoes.codigoManual.trim() !== '') {
            const codigoManual = opcoes.codigoManual.trim();

            if (!/^\d+$/.test(codigoManual)) {
                socket.emit('erro_criar_sala', 'O código deve conter apenas números.');
                return;
            }
            if (codigoManual.length < 3 || codigoManual.length > 10) {
                socket.emit('erro_criar_sala', 'O código deve ter entre 3 e 10 dígitos.');
                return;
            }
            if (salas[codigoManual]) {
                // Verifica se o professor que criou esta sala ainda está conectado pelo socket.id original.
                // Conectado → sala realmente em uso, recusa a criação.
                // Desconectado → professor fechou o browser sem clicar "Encerrar Sessão" (sala fantasma),
                //                 pode sobrescrever com segurança.
                //
                // PONTO FRACO: após reconexão do professor (F5 ou queda de rede), o socket.id muda.
                // criadorSocketId continua apontando para o socket antigo (já desconectado).
                // Se nesse momento alguém tentar criar o mesmo código, a sala ativa seria deletada.
                // Na prática essa janela é de milissegundos e o risco é muito baixo.
                // Solução definitiva exigiria autenticação por token persistente no WebSocket.
                const criadorConectado = io.sockets.sockets.has(salas[codigoManual].criadorSocketId);
                if (criadorConectado) {
                    socket.emit('erro_criar_sala', 'Esse código já está em uso. Escolha outro.');
                    return;
                }
                // Professor da sessão anterior desconectou sem encerrar — limpa a sala fantasma
                delete salas[codigoManual];
                console.log(`Sala fantasma ${codigoManual} removida ao recriar.`);
            }
            codigo = codigoManual;
        } else {
            const qtdDigitos = (opcoes && opcoes.qtdDigitos) ? parseInt(opcoes.qtdDigitos) : 6;
            let tentativas = 0;
            do {
                codigo = gerarCodigoAleatorio(qtdDigitos);
                tentativas++;
                if (tentativas > 100) {
                    socket.emit('erro_criar_sala', 'Não foi possível gerar um código único.');
                    return;
                }
                // Mesma lógica do código manual: se o código gerado pertence a uma sala
                // fantasma (criador desconectado), limpa para liberar o código.
                if (salas[codigo] && !io.sockets.sockets.has(salas[codigo].criadorSocketId)) {
                    delete salas[codigo];
                    console.log(`Sala fantasma ${codigo} removida durante geração aleatória.`);
                }
            } while (salas[codigo]);
        }

        socket.join(codigo);

        const configInicial = {
            tipoPergunta: 'multipla_escolha',
            modoSelecao: 'unica',
            qtdOpcoes: 4
        };

        salas[codigo] = {
            config: configInicial,
            votos: montarObjetoVotos(configInicial),
            respostasDiscursivas: [],
            total: 0,
            voters: new Set(),
            // Guarda o socket.id do professor criador para detectar salas fantasmas.
            // Usado na checagem de criar_sala acima. Torna-se desatualizado após reconexão do professor.
            criadorSocketId: socket.id
        };

        socket.emit('sala_criada', codigo);
        socket.emit('atualizar_config_aluno', salas[codigo].config);
    });

    socket.on('entrar_sala', (dados) => {
        // NOTA: este evento é usado tanto por alunos quanto pelo professor ao reconectar (F5).
        // Não há como distinguir os dois aqui sem autenticação no socket do professor.
        // Por isso, criadorSocketId NÃO é atualizado na reconexão — veja o comentário em criar_sala.
        const { codigo } = dados;
        if (salas[codigo]) {
            socket.join(codigo);
            socket.emit('entrada_ok');
            socket.emit('atualizar_config_aluno', salas[codigo].config);
            socket.emit('atualizar_stats_aluno', { total: salas[codigo].total });

            if (salas[codigo].config.tipoPergunta === 'discursiva') {
                socket.emit('atualizar_discursivas', salas[codigo].respostasDiscursivas);
            } else {
                socket.emit('atualizar_grafico', salas[codigo].votos);
            }

            if (salas[codigo].voters.has(alunoId)) {
                socket.emit('bloquear_voto');
            } else {
                // Garante que o cliente esteja desbloqueado (cobre o caso de
                // reconexão após reset: o aluno perdeu o evento 'reset_aluno'
                // enquanto estava desconectado, mas o servidor já limpou voters).
                socket.emit('reset_aluno');
            }
        } else {
            socket.emit('erro_sala', 'Sala não encontrada.');
        }
    });

    socket.on('alterar_config', (dados) => {
        const { codigo, novaConfig } = dados;
        if (salas[codigo]) {
            salas[codigo].config = novaConfig;
            salas[codigo].votos = montarObjetoVotos(novaConfig);
            salas[codigo].respostasDiscursivas = [];
            salas[codigo].total = 0;
            salas[codigo].voters.clear();

            io.to(codigo).emit('atualizar_config_aluno', novaConfig);
            io.to(codigo).emit('atualizar_grafico', salas[codigo].votos);
            io.to(codigo).emit('atualizar_discursivas', []);
            io.to(codigo).emit('reset_aluno');
            io.to(codigo).emit('atualizar_stats_aluno', { total: 0 });
        }
    });

    socket.on('enviar_resposta', (dados) => {
        const { codigo, respostas } = dados;
        if (salas[codigo]) {
            if (salas[codigo].voters.has(alunoId)) {
                socket.emit('erro_voto', 'Você já respondeu!');
                return;
            }

            if (salas[codigo].config.tipoPergunta === 'discursiva') {
                // LIMITAÇÃO: não há validação de tamanho nem limite de entradas.
                // Um aluno poderia enviar um texto muito longo, consumindo memória.
                // Considere adicionar: if (typeof respostas !== 'string' || respostas.length > 500) return;
                salas[codigo].respostasDiscursivas.push(respostas);
                io.to(codigo).emit('atualizar_discursivas', salas[codigo].respostasDiscursivas);
            } else {
                if (Array.isArray(respostas)) {
                    respostas.forEach(opcao => {
                        if (salas[codigo].votos[opcao] !== undefined) salas[codigo].votos[opcao]++;
                    });
                } else {
                    if (salas[codigo].votos[respostas] !== undefined) salas[codigo].votos[respostas]++;
                }
                io.to(codigo).emit('atualizar_grafico', salas[codigo].votos);
            }

            salas[codigo].voters.add(alunoId);
            salas[codigo].total++;
            io.to(codigo).emit('atualizar_stats_aluno', { total: salas[codigo].total });
            socket.emit('voto_confirmado');
        }
    });

    socket.on('resetar_sala', (codigo) => {
        if (salas[codigo]) {
            const chaves = Object.keys(salas[codigo].votos);
            chaves.forEach(k => salas[codigo].votos[k] = 0);

            salas[codigo].respostasDiscursivas = [];
            salas[codigo].total = 0;
            salas[codigo].voters.clear();

            io.to(codigo).emit('atualizar_grafico', salas[codigo].votos);
            io.to(codigo).emit('atualizar_discursivas', []);
            io.to(codigo).emit('reset_aluno');
            io.to(codigo).emit('atualizar_stats_aluno', { total: 0 });
        }
    });

    socket.on('encerrar_sala', (codigo) => {
        if (salas[codigo]) {
            io.to(codigo).emit('sala_encerrada');

            const socketsNaSala = io.sockets.adapter.rooms.get(codigo);
            if (socketsNaSala) {
                const socketIds = [...socketsNaSala];
                socketIds.forEach(socketId => {
                    io.sockets.sockets.get(socketId)?.leave(codigo);
                });
            }

            delete salas[codigo];
            console.log(`Sala ${codigo} encerrada e removida.`);
        }
    });
});

app.get('/qtd_respostas', (req, res) => {

    const codigo = req.query.codigo;

    res.send(salas[codigo].total);
})

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`GitWil API rodando na porta ${PORT}`);
});
