import crypto from 'crypto';
import {ADMIN_PASS_HASH} from './init.js';

export function gerarCodigoAleatorio(qtdDigitos) {
    const digitos = Math.max(3, Math.min(10, qtdDigitos || 6));
    const min = Math.pow(10, digitos - 1);
    const max = Math.pow(10, digitos) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

export function verificarSenha(senhaDigitada) {
    if (!senhaDigitada) return false;
    const hash = crypto.createHash('sha256').update(senhaDigitada).digest('hex');
    return hash === ADMIN_PASS_HASH;
}