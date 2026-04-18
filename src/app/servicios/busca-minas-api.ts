import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

interface ResultadoJugadaRequest {
  fila: number;
  columna: number;
  minasAlrededor: number;
}

interface MinaRequest {
  fila: number;
  columna: number;
}

@Injectable({
  providedIn: 'root'
})
export class BuscaMinasApi {
  private http = inject(HttpClient);

  // URL base del backend — ajusta el puerto si es diferente
  private urlBase = 'http://localhost:3000/ia';

  /**
   * Crea el tablero vacío y devuelve automáticamente la primera jugada de la IA.
   * No requiere body — la IA escoge sola su primer casilla.
   */
  crearTablero(): Observable<unknown> {
    return this.http.post(`${this.urlBase}/tablero`, {});
  }

  /**
   * Informa al backend cuántas minas había alrededor de la casilla levantada.
   * La respuesta ya incluye la siguiente jugada que la IA recomienda.
   */
  registrarResultado(data: ResultadoJugadaRequest): Observable<unknown> {
    return this.http.post(`${this.urlBase}/resultado`, data);
  }

  /**
   * Informa que la casilla levantada era una mina — juego perdido.
   * El backend marca el juego como terminado.
   */
  registrarMina(data: MinaRequest): Observable<unknown> {
    return this.http.post(`${this.urlBase}/mina`, data);
  }

  /**
   * Reinicia el tablero y el estado de la IA para una nueva partida.
   */
  reiniciarTablero(): Observable<unknown> {
    return this.http.post(`${this.urlBase}/reiniciar`, {});
  }

  /**
   * Consulta el estado actual del tablero.
   * Útil para sincronizar la vista si algo falla.
   */
  verTablero(): Observable<unknown> {
    return this.http.get(`${this.urlBase}/tablero`);
  }
}