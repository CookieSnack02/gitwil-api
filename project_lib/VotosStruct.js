
export function montarObjetoRespostas(config) {
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
    } else if(config.tipoPergunta === 'discursiva'){
       votos['res_discursivas'] = [];
    }
    return votos;
}