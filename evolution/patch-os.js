/**
 * No WSL, os.release() vira algo como "6.18.33.2-microsoft-standard-WSL2".
 * O Baileys usa isso como 3º campo do browser e o WhatsApp rejeita o pareamento.
 */
const os = require('os');
os.release = () => '22.04.0';
os.platform = () => 'linux';
os.type = () => 'Linux';
