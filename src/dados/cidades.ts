// Capitais brasileiras para a tela escolher. Coordenadas com 2 casas decimais; fuso em horas em relação a UTC.

export interface Cidade {
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  fuso: number;
}

export const CIDADES: Cidade[] = [
  { nome: 'Aracaju', uf: 'SE', lat: -10.91, lon: -37.07, fuso: -3 },
  { nome: 'Belém', uf: 'PA', lat: -1.46, lon: -48.5, fuso: -3 },
  { nome: 'Belo Horizonte', uf: 'MG', lat: -19.92, lon: -43.94, fuso: -3 },
  { nome: 'Boa Vista', uf: 'RR', lat: 2.82, lon: -60.67, fuso: -4 },
  { nome: 'Brasília', uf: 'DF', lat: -15.78, lon: -47.93, fuso: -3 },
  { nome: 'Campo Grande', uf: 'MS', lat: -20.44, lon: -54.65, fuso: -4 },
  { nome: 'Cuiabá', uf: 'MT', lat: -15.6, lon: -56.1, fuso: -4 },
  { nome: 'Curitiba', uf: 'PR', lat: -25.43, lon: -49.27, fuso: -3 },
  { nome: 'Florianópolis', uf: 'SC', lat: -27.6, lon: -48.55, fuso: -3 },
  { nome: 'Fortaleza', uf: 'CE', lat: -3.73, lon: -38.52, fuso: -3 },
  { nome: 'Goiânia', uf: 'GO', lat: -16.69, lon: -49.26, fuso: -3 },
  { nome: 'João Pessoa', uf: 'PB', lat: -7.12, lon: -34.86, fuso: -3 },
  { nome: 'Macapá', uf: 'AP', lat: 0.03, lon: -51.07, fuso: -3 },
  { nome: 'Maceió', uf: 'AL', lat: -9.67, lon: -35.74, fuso: -3 },
  { nome: 'Manaus', uf: 'AM', lat: -3.12, lon: -60.02, fuso: -4 },
  { nome: 'Natal', uf: 'RN', lat: -5.79, lon: -35.21, fuso: -3 },
  { nome: 'Palmas', uf: 'TO', lat: -10.18, lon: -48.33, fuso: -3 },
  { nome: 'Porto Alegre', uf: 'RS', lat: -30.03, lon: -51.23, fuso: -3 },
  { nome: 'Porto Velho', uf: 'RO', lat: -8.76, lon: -63.9, fuso: -4 },
  { nome: 'Recife', uf: 'PE', lat: -8.05, lon: -34.88, fuso: -3 },
  { nome: 'Rio Branco', uf: 'AC', lat: -9.97, lon: -67.81, fuso: -5 },
  { nome: 'Rio de Janeiro', uf: 'RJ', lat: -22.91, lon: -43.17, fuso: -3 },
  { nome: 'Salvador', uf: 'BA', lat: -12.97, lon: -38.5, fuso: -3 },
  { nome: 'São Luís', uf: 'MA', lat: -2.53, lon: -44.3, fuso: -3 },
  { nome: 'São Paulo', uf: 'SP', lat: -23.55, lon: -46.63, fuso: -3 },
  { nome: 'Teresina', uf: 'PI', lat: -5.09, lon: -42.8, fuso: -3 },
  { nome: 'Vitória', uf: 'ES', lat: -20.32, lon: -40.34, fuso: -3 },
];
