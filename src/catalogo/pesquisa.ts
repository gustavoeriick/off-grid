// Leitura do JSON da pesquisa, só para os testes. O catálogo do aplicativo não importa este arquivo.

export interface Registro {
  secao: string;
  tituloSecao: string;
  busca: string;
  titulo: string;
  marcaModelo: string;
  especificacoes: string;
  preco: number | null;
  notaPreco: string | null;
  precoPix: number | null;
  precoRiscado: number | null;
  frete: string;
  vendedor: string;
  lojaOficial: boolean | null;
  vendidosNota: string | null;
  link: string;
  codigo: string;
}

export interface Pesquisa {
  coletadoEm: string;
  registros: Registro[];
}

const arquivos = import.meta.glob<Pesquisa>('../../pesquisa/precos-mercado-livre-*.json', {
  eager: true,
  import: 'default',
});

const nomes = Object.keys(arquivos).sort();
if (nomes.length === 0) throw new Error('Nenhum JSON de pesquisa em pesquisa/. Rode scripts/importar-pesquisa.mjs.');

/** A coleta mais recente. */
export const PESQUISA: Pesquisa = arquivos[nomes[nomes.length - 1]];
