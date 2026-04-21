import { Server } from "socket.io";
import Sala from './Sala.js';
import { ORIGENS_PERMITIDAS, salas } from './project_lib/init.js';
import {gerarCodigoAleatorio} from './project_lib/helpers.js';

export default class SocketManager{

    constructor(server){
        this.io = new Server(
            server, 
            {cors: {
                origin: ORIGENS_PERMITIDAS,
                methods: ['GET', 'POST']
            }}
        );
    }

    getTheIo(){
        return this.io;
    }

    start(){
        this.io.on('connection', (socket) => {
            const alunoId = socket.handshake.auth.alunoId || socket.id; 

            socket.on('criar_sala', (opcoes) => {
                let codigo;

                if (opcoes && opcoes.codigoManual && opcoes.codigoManual.trim() !== '') {
                    const codigoManual = opcoes.codigoManual.trim();

                    //compactei as duas formas em uma so e tirei o regex, imagino que sem regex talvez traga mais legibilidade.
                    if (codigoManual.length < 3 || codigoManual.length > 10 || isNaN(Number(codigoManual))) {
                        socket.emit('erro_criar_sala', 'O código deve conter apenas números e ter entre 3 e 10 dígitos.');
                        return;
                    }

                    if (salas[codigoManual]) {
                        const criadorConectado = this.io.sockets.sockets.has(salas[codigoManual].criadorSocketId);
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
                        if (salas[codigo] && !this.io.sockets.sockets.has(salas[codigo].criadorSocketId)) {
                            delete salas[codigo];
                            console.log(`Sala fantasma ${codigo} removida durante geração aleatória.`);
                        }
                    } while (salas[codigo]);
                }

                socket.join(codigo);

                salas[codigo] = new Sala(socket.id);

                socket.emit('sala_criada', codigo);
                socket.emit('atualizar_config_aluno', salas[codigo].config);
            });

            socket.on('reconectar_professor', (dados) => {
                const { codigo } = dados;

                if (!salas[codigo]) 
                    return;
                if(salas[codigo].criadorSocketId != socket.id){
                    salas[codigo].criadorSocketId = socket.id;//trocar para uma novo soket id
                }

            });

            socket.on('entrar_sala', (dados) => {
                // NOTA: este evento é usado tanto por alunos quanto pelo professor ao reconectar (F5).
                // Não há como distinguir os dois aqui sem autenticação no socket do professor.
                // Por isso, criadorSocketId NÃO é atualizado na reconexão — veja o comentário em criar_sala.
                const { codigo } = dados;
                if (salas[codigo]) {
                    socket.join(codigo);
                    socket.emit('entrada_ok');                                              //Referenciado na linha 171-174 de aluno.html 
                    socket.emit('atualizar_config_aluno', salas[codigo].config);            //Referenciado a 178 - 183 de aluno.html   
                    socket.emit('atualizar_stats_aluno', { total: salas[codigo].total_votos });   //Referenciado linha 185 aluno.html 

                    if (salas[codigo].config.tipoPergunta === 'discursiva') {
                        socket.emit('atualizar_discursivas', salas[codigo].respostas['res_discursivas']);
                    } else {
                        socket.emit('atualizar_grafico', salas[codigo].respostas);
                    }
                    /*  Problema de bloqueio de votação  */
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

                    salas[codigo].resetarConfig(novaConfig);

                    this.io.to(codigo).emit('atualizar_config_aluno', novaConfig);
                    this.io.to(codigo).emit('atualizar_grafico', salas[codigo].total_votos);
                    this.io.to(codigo).emit('atualizar_discursivas', []);
                    this.io.to(codigo).emit('reset_aluno');
                    this.io.to(codigo).emit('atualizar_stats_aluno', { total: 0 });            
                }
            });

            socket.on('enviar_resposta', (dados) => {

                const { codigo, respostas } = dados;

                if (salas[codigo]) {

                    try{

                        salas[codigo].checkAlunoVotou(alunoId);

                        if (salas[codigo].config.tipoPergunta === 'discursiva') {

                            salas[codigo].guardaRespostasDiscursiva(respostas);

                            this.io.to(codigo).emit('atualizar_discursivas', salas[codigo].respostas['res_discursivas']);

                        } else {

                            salas[codigo].guardaRespostasObjetivas(respostas);
                            
                            this.io.to(codigo).emit('atualizar_grafico', salas[codigo].respostas);

                        }

                        salas[codigo].registrarVotoAluno(alunoId);
                    
                        this.io.to(codigo).emit('atualizar_stats_aluno', { total: salas[codigo].total_votos });

                        socket.emit('voto_confirmado');

                    }catch(erro){
                        socket.emit('erro_voto', erro.message);
                    }
                }
            });

            socket.on('resetar_sala', (codigo) => {
                if (salas[codigo]) {

                    salas[codigo].resetarSala()

                    this.io.to(codigo).emit('atualizar_grafico', salas[codigo].respostas);
                    this.io.to(codigo).emit('atualizar_discursivas', []);
                    this.io.to(codigo).emit('reset_aluno');
                    this.io.to(codigo).emit('atualizar_stats_aluno', { total: 0 });
                }
            });

            socket.on('encerrar_sala', (codigo) => {
                if (salas[codigo]) {
                    this.io.to(codigo).emit('sala_encerrada');

                    const socketsNaSala = this.io.sockets.adapter.rooms.get(codigo);
                    if (socketsNaSala) {
                        const socketIds = [...socketsNaSala];
                        socketIds.forEach(socketId => {
                            this.io.sockets.sockets.get(socketId)?.leave(codigo);
                        });
                    }

                    delete salas[codigo];
                    console.log(`Sala ${codigo} encerrada e removida.`);
                }
            });
        });
    }
}
