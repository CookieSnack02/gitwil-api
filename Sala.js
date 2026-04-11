import { montarObjetoRespostas } from './VotosStruct.js'

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

    
    
}