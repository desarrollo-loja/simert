export interface DinardapAntResponse {
  paquete: Paquete;
}

export interface Paquete {
  numeroPaquete: string;
  entidades: Entidades;
}

export interface Entidades {
  entidad: Entidad[];
}

export interface Entidad {
  nombre: string;
  filas: Filas;
}

export interface Filas {
  fila: Fila[];
}

export interface Fila {
  columnas: Columnas;
}

export interface Columnas {
  columna: Columna[];
}

export interface Columna {
  campo: string;
  valor: string;
}
