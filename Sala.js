import { montarObjetoRespostas } from './project_lib/VotosStruct.js'

const configInicial = {
    tipoPergunta: 'multipla_escolha',
    modoSelecao: 'unica',
    qtdOpcoes: 4
}

export default class Sala{
    
    constructor(socekt_id){
        this.config = configInicial;
        this.respostas = montarObjetoRespostas(configInicial);
        this.total_votos = 0;
        this.voters = new Set();
        this.criadorSocketId =  socekt_id;
    }

    resetarConfig(novaConfig){
        this.config = novaConfig;
        this.respostas = montarObjetoRespostas(novaConfig);
        this.total_votos = 0;
        this.voters.clear();
    }

    resetarSala(){

        if(Array.isArray(this.respostas)){
            this.respostas = [] //discursivas
        }else{
            const chaves = Object.keys(this.respostas);
            chaves.forEach(k => this.respostas[k] = 0);
        }

        this.total_votos = 0;
        this.voters.clear();
    }

    checkAlunoVotou(alunoId){
        if(this.voters.has(alunoId)){
            throw new Error('Você já respondeu!');
        }
    }

    registrarVotoAluno(alunoId){
        this.voters.add(alunoId);
        this.total_votos++;
    }

    guardaRespostasDiscursiva(resposta){

        if (resposta.length > 500) 
            throw new RangeError("Texto excede o limite de 500 caracteres");
                
        this.respostas['res_discursivas'].push(resposta);

    } 

    guardaRespostasObjetivas(resposta){

        const opcoes = Array.isArray(resposta) ? resposta : [resposta];

        opcoes.forEach(opcao => {
            if (this.respostas[opcao] !== undefined) this.respostas[opcao]++;
        });

    }
    
}