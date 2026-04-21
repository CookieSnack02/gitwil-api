import 'dotenv/config';

export const PORT = process.env.PORT || 3000;
export const ADMIN_USER = process.env.ADMIN_USER || "wilson";
export const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "df52552b4e09eb2a3e3cbb9b53b1d499260147c789e3b699b1e921252379672b";

export const ORIGENS_PERMITIDAS = [
    'https://gitwil.com.br',
    'https://www.gitwil.com.br',
    // 'http://localhost:5173',
    // 'http://localhost:3030',
    // 'http://127.0.0.1:5500',
    // 'http://127.0.0.1:5500',
    // Para testes locais, descomente as linhas acima
];

// ATENÇÃO: Salas salvas em memoria, caso haja nessecidade de algo maior necessario persistir os dados em um BD (ex: Redis, SQLite) 
export const salas = {};
