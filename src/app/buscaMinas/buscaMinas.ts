import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuscaMinasApi } from '../servicios/busca-minas-api';

interface Cuadro {
  fila: number;
  columna: number;
  levantado: boolean;
  esMina: boolean;
  numero: number | null;
}

@Component({
  selector: 'app-busca-minas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './buscaMinas.html',
  styleUrls: ['./buscaMinas.scss']
})
export class BuscaMinasComponent implements OnInit {
  private api = inject(BuscaMinasApi);
  private platformId = inject(PLATFORM_ID);

  titulo = 'Busca Minas';
  subtitulo = 'Tablero 10x10';

  filas = 10;
  columnas = 10;

  juegoTerminado = false;
  mensajeEstado = 'Inicializando tablero...';
  totalLevantados = 0;

  tablero: Cuadro[][] = [];

  dialogoVisible = false;
  cuadroPendiente: Cuadro | null = null;
  cuadroActual: Cuadro | null = null;

  opcionElegida: 'mina' | 'numero' | '' = '';
  numeroEscrito = '';
  errorDialogo = '';

  ngOnInit(): void {
    this.armarTablero();

    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        this.iniciarJuego();
      }, 0);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INICIO DEL JUEGO
  // ─────────────────────────────────────────────────────────────────────────

  iniciarJuego(): void {
    this.juegoTerminado = false;
    this.totalLevantados = 0;
    this.cuadroActual = null;
    this.limpiarDialogo();
    this.armarTablero();

    this.mensajeEstado = 'Creando tablero...';

    // crearTablero ya devuelve la primera jugada de la IA directamente
    this.api.crearTablero().subscribe({
      next: (respuesta: unknown) => {
        this.mensajeEstado = 'Tablero creado. La IA eligió su primera casilla.';
        this.procesarJugadaRecibida(respuesta);
      },
      error: (error: unknown) => {
        this.mensajeEstado = 'No se pudo crear el tablero.';
        console.error('Error al crear tablero:', error);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCESAR JUGADA RECIBIDA DEL BACKEND
  // Tanto crearTablero como registrarResultado devuelven una jugada.
  // Este método centraliza cómo se muestra esa jugada al usuario.
  // ─────────────────────────────────────────────────────────────────────────

  private procesarJugadaRecibida(respuesta: unknown): void {
    const jugada = this.extraerJugada(respuesta);

    if (!jugada) {
      this.mensajeEstado = 'La IA devolvió una jugada con formato no esperado.';
      console.error('Formato inesperado:', respuesta);
      return;
    }

    const { fila, columna } = jugada;

    if (fila < 0 || fila >= this.filas || columna < 0 || columna >= this.columnas) {
      this.mensajeEstado = 'La IA devolvió una posición inválida.';
      return;
    }

    const cuadro = this.tablero[fila]?.[columna];

    if (!cuadro) {
      this.mensajeEstado = 'No se pudo ubicar el cuadro indicado por la IA.';
      return;
    }

    if (cuadro.levantado) {
      this.mensajeEstado = 'La IA intentó seleccionar un cuadro ya levantado.';
      return;
    }

    this.cuadroPendiente = cuadro;
    this.cuadroActual = cuadro;
    this.dialogoVisible = true;
    this.opcionElegida = '';
    this.numeroEscrito = '';
    this.errorDialogo = '';

    this.mensajeEstado = `IA seleccionó fila ${fila + 1}, columna ${columna + 1}. ¿Qué hay ahí?`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIRMAR JUGADA — MINA O NÚMERO
  // ─────────────────────────────────────────────────────────────────────────

  confirmarJugada(): void {
    if (!this.cuadroPendiente) return;

    if (this.opcionElegida === '') {
      this.errorDialogo = 'Debes elegir mina o número.';
      return;
    }

    // ── Caso: era una mina ───────────────────────────────────────────────
    if (this.opcionElegida === 'mina') {
      const fila = this.cuadroPendiente.fila;
      const columna = this.cuadroPendiente.columna;

      // Marcar visualmente el cuadro como mina
      this.cuadroPendiente.levantado = true;
      this.cuadroPendiente.esMina = true;
      this.cuadroPendiente.numero = null;
      this.totalLevantados++;

      // Informar al backend que el juego se perdió
      this.api.registrarMina({ fila, columna }).subscribe({
        next: () => {
          this.juegoTerminado = true;
          this.mensajeEstado = `Juego terminado. Mina en fila ${fila + 1}, columna ${columna + 1}.`;
          this.limpiarDialogo();
        },
        error: (error: unknown) => {
          // Aunque falle el backend, el juego igual se marca como perdido en el front
          this.juegoTerminado = true;
          this.mensajeEstado = `Mina en fila ${fila + 1}, columna ${columna + 1}. Juego perdido.`;
          this.limpiarDialogo();
          console.error('Error al registrar mina:', error);
        }
      });

      return;
    }

    // ── Caso: había un número ─────────────────────────────────────────────
    if (this.opcionElegida === 'numero') {
      const numeroLimpio = this.numeroEscrito.trim();

      // 0 también es válido: significa que no hay minas alrededor
      if (!/^[0-8]$/.test(numeroLimpio)) {
        this.errorDialogo = 'Solo puedes escribir un número del 0 al 8.';
        return;
      }

      const minasAlrededor = Number(numeroLimpio);
      const fila = this.cuadroPendiente.fila;
      const columna = this.cuadroPendiente.columna;

      // registrarResultado devuelve directamente la siguiente jugada de la IA
      this.api.registrarResultado({ fila, columna, minasAlrededor }).subscribe({
        next: (respuesta: unknown) => {
          if (!this.cuadroPendiente) return;

          // Marcar el cuadro como levantado con su número
          this.cuadroPendiente.levantado = true;
          this.cuadroPendiente.esMina = false;
          this.cuadroPendiente.numero = minasAlrededor;
          this.totalLevantados++;

          this.mensajeEstado = `Registrado: fila ${fila + 1}, columna ${columna + 1} → ${minasAlrededor} minas alrededor.`;
          this.limpiarDialogo();

          // La respuesta ya incluye la siguiente jugada — no hace falta un GET extra
          setTimeout(() => {
            this.procesarJugadaRecibida(respuesta);
          }, 400);
        },
        error: (error: any) => {
          this.mensajeEstado = 'No se pudo registrar el resultado en el backend.';
          console.error('Error al registrar resultado:', error);
          console.error('Detalle:', error?.error);
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REINICIAR
  // ─────────────────────────────────────────────────────────────────────────

  reiniciarJuego(): void {
    this.api.reiniciarTablero().subscribe({
      next: () => {
        this.mensajeEstado = 'Reiniciando...';
        setTimeout(() => {
          this.iniciarJuego();
        }, 250);
      },
      error: (error: unknown) => {
        this.mensajeEstado = 'No se pudo reiniciar el tablero.';
        console.error('Error al reiniciar:', error);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXTRAER JUGADA DE LA RESPUESTA DEL BACKEND
  // El backend devuelve { jugada: { fila, columna, ... }, tablero: {...} }
  // ─────────────────────────────────────────────────────────────────────────

  private extraerJugada(respuesta: unknown): { fila: number; columna: number } | null {
    if (!respuesta || typeof respuesta !== 'object') return null;

    const data = respuesta as Record<string, unknown>;

    // Formato esperado: { jugada: { fila, columna } }
    if (data['jugada'] && typeof data['jugada'] === 'object') {
      const jugada = data['jugada'] as Record<string, unknown>;
      if (typeof jugada['fila'] === 'number' && typeof jugada['columna'] === 'number') {
        return { fila: jugada['fila'], columna: jugada['columna'] };
      }
    }

    // Fallback: { fila, columna } directo en la raíz
    if (typeof data['fila'] === 'number' && typeof data['columna'] === 'number') {
      return { fila: data['fila'], columna: data['columna'] };
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILIDADES
  // ─────────────────────────────────────────────────────────────────────────

  armarTablero(): void {
    this.tablero = [];
    for (let fila = 0; fila < this.filas; fila++) {
      const filaNueva: Cuadro[] = [];
      for (let columna = 0; columna < this.columnas; columna++) {
        filaNueva.push({ fila, columna, levantado: false, esMina: false, numero: null });
      }
      this.tablero.push(filaNueva);
    }
  }

  elegirMina(): void {
    this.opcionElegida = 'mina';
    this.numeroEscrito = '';
    this.errorDialogo = '';
  }

  elegirNumero(): void {
    this.opcionElegida = 'numero';
    this.errorDialogo = '';
  }

  marcarNumeroAutomaticamente(): void {
    // 0 también es válido
    if (/^[0-8]$/.test(this.numeroEscrito.trim())) {
      this.opcionElegida = 'numero';
      this.errorDialogo = '';
    }
  }

  puedeConfirmar(): boolean {
    if (!this.cuadroPendiente || this.juegoTerminado) return false;
    if (this.opcionElegida === 'mina') return true;
    if (this.opcionElegida === 'numero') return /^[0-8]$/.test(this.numeroEscrito.trim());
    return false;
  }

  cancelarJugada(): void {
    this.dialogoVisible = false;
    this.opcionElegida = '';
    this.numeroEscrito = '';
    this.errorDialogo = '';
    this.mensajeEstado = 'Jugada cancelada.';
  }

  limpiarDialogo(): void {
    this.dialogoVisible = false;
    this.cuadroPendiente = null;
    this.opcionElegida = '';
    this.numeroEscrito = '';
    this.errorDialogo = '';
  }

  obtenerTextoCuadro(cuadro: Cuadro): string {
    if (!cuadro.levantado) return '';
    if (cuadro.esMina) return '✹';
    if (cuadro.numero !== null) return String(cuadro.numero);
    return '';
  }

  obtenerClaseNumero(cuadro: Cuadro): string {
    if (!cuadro.levantado || cuadro.numero === null) return '';
    return `numero-${cuadro.numero}`;
  }

  esCuadroActual(cuadro: Cuadro): boolean {
    if (!this.cuadroActual) return false;
    return cuadro.fila === this.cuadroActual.fila && cuadro.columna === this.cuadroActual.columna;
  }
}