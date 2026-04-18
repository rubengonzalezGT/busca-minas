import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
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
  styleUrls: ['./buscaMinas.scss'],
  host: { ngSkipHydration: 'true' }
})
export class BuscaMinasComponent implements OnInit {
  private api = inject(BuscaMinasApi);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);

  titulo = 'Busca Minas';
  subtitulo = 'Tablero 10x10';

  filas = 10;
  columnas = 10;

  juegoTerminado = false;
  mensajeEstado = 'Iniciando...';
  totalLevantados = 0;

  tablero: Cuadro[][] = [];

  dialogoVisible = false;
  cuadroPendiente: Cuadro | null = null;
  cuadroActual: Cuadro | null = null;

  opcionElegida: 'mina' | 'numero' | '' = '';
  numeroEscrito = '';
  errorDialogo = '';
  cargando = false;

  iniciado = false;

  ngOnInit(): void {
    this.armarTablero();
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        if (!this.iniciado) {
          this.iniciado = true;
          this.iniciarJuego();
        }
      }, 0);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  iniciarJuego(): void {
    if (this.cargando) return;
    this.cargando = true;

    this.juegoTerminado = false;
    this.totalLevantados = 0;
    this.cuadroActual = null;
    this.limpiarDialogo();
    this.armarTablero();
    this.mensajeEstado = 'Creando tablero...';

    this.api.crearTablero().subscribe({
      next: (respuesta: unknown) => {
        this.cargando = false;
        this.mostrarJugada(respuesta);
        this.cdr.detectChanges();
      },
      error: (err: unknown) => {
        this.cargando = false;
        this.mensajeEstado = 'Error al crear tablero. Revisa que el backend esté corriendo.';
        console.error(err);
        this.cdr.detectChanges();
      }
    });
  }

  reiniciarJuego(): void {
    this.iniciado = true;
    this.cargando = false;
    this.limpiarDialogo();

    this.api.reiniciarTablero().subscribe({
      next: () => this.iniciarJuego(),
      error: () => this.iniciarJuego()
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  private mostrarJugada(respuesta: unknown): void {
    const jugada = this.extraerJugada(respuesta);

    if (!jugada) {
      this.mensajeEstado = 'Formato inesperado del backend.';
      return;
    }

    const { fila, columna } = jugada;
    const cuadro = this.tablero[fila]?.[columna];

    if (!cuadro || cuadro.levantado) {
      this.mensajeEstado = 'La IA seleccionó un cuadro no disponible.';
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
  // CALCULAR MÁXIMO DE VECINOS SEGÚN POSICIÓN
  //
  // En un tablero 10x10:
  //   - Esquinas (4 casillas): 3 vecinos máximo
  //   - Bordes no-esquinas (32 casillas): 5 vecinos máximo
  //   - Interior (64 casillas): 8 vecinos máximo
  //
  // Un número mayor a estos máximos es matemáticamente imposible.
  // ─────────────────────────────────────────────────────────────────────────

  private calcularMaxVecinos(fila: number, columna: number): number {
    const enBordeVertical = fila === 0 || fila === this.filas - 1;
    const enBordeHorizontal = columna === 0 || columna === this.columnas - 1;

    if (enBordeVertical && enBordeHorizontal) return 3;  // esquina
    if (enBordeVertical || enBordeHorizontal) return 5;  // borde
    return 8;                                             // interior
  }

  // ─────────────────────────────────────────────────────────────────────────

  confirmarJugada(): void {
    if (this.cargando || !this.cuadroPendiente || this.juegoTerminado) return;
    if (this.opcionElegida === '') { this.errorDialogo = 'Elige mina o número.'; return; }

    const cuadroAMarcar = this.cuadroPendiente;
    const { fila, columna } = cuadroAMarcar;

    if (this.opcionElegida === 'mina') {
      this.cargando = true;

      this.api.registrarMina({ fila, columna }).subscribe({
        next: () => {
          cuadroAMarcar.levantado = true;
          cuadroAMarcar.esMina = true;
          this.totalLevantados++;
          this.juegoTerminado = true;
          this.cargando = false;
          this.limpiarDialogo();
          this.mensajeEstado = `Juego terminado. Mina en [${fila + 1}, ${columna + 1}].`;
          this.cdr.detectChanges();
        },
        error: () => {
          cuadroAMarcar.levantado = true;
          cuadroAMarcar.esMina = true;
          this.totalLevantados++;
          this.juegoTerminado = true;
          this.cargando = false;
          this.limpiarDialogo();
          this.mensajeEstado = `Mina en [${fila + 1}, ${columna + 1}]. Juego perdido.`;
          this.cdr.detectChanges();
        }
      });
      return;
    }

    if (this.opcionElegida === 'numero') {
      const num = this.numeroEscrito.trim();
      if (!/^[0-8]$/.test(num)) { this.errorDialogo = 'Escribe un número del 0 al 8.'; return; }

      const minasAlrededor = Number(num);

      // Validar que el número sea posible según la posición de la casilla.
      // Una casilla en esquina solo tiene 3 vecinos, no puede tener 4 minas alrededor.
      const maxVecinos = this.calcularMaxVecinos(fila, columna);
      if (minasAlrededor > maxVecinos) {
        const tipoCasilla =
          maxVecinos === 3 ? 'en una esquina' :
          maxVecinos === 5 ? 'en un borde' : 'en el interior';
        this.errorDialogo = `Imposible: esta casilla está ${tipoCasilla} y solo tiene ${maxVecinos} vecinos. Máximo: ${maxVecinos} minas alrededor.`;
        return;
      }

      this.cargando = true;

      this.api.registrarResultado({ fila, columna, minasAlrededor }).subscribe({
        next: (respuesta: unknown) => {
          cuadroAMarcar.levantado = true;
          cuadroAMarcar.esMina = false;
          cuadroAMarcar.numero = minasAlrededor;
          this.totalLevantados++;
          this.cargando = false;
          this.limpiarDialogo();
          this.mensajeEstado = `[${fila + 1}, ${columna + 1}] → ${minasAlrededor} minas alrededor.`;
          this.cdr.detectChanges();

          setTimeout(() => {
            this.mostrarJugada(respuesta);
            this.cdr.detectChanges();
          }, 400);
        },
        error: (err: any) => {
          this.cargando = false;
          this.errorDialogo = 'Error al registrar. Intenta de nuevo.';
          console.error(err?.error ?? err);
          this.cdr.detectChanges();
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private extraerJugada(r: unknown): { fila: number; columna: number } | null {
    if (!r || typeof r !== 'object') return null;
    const d = r as Record<string, unknown>;
    if (d['jugada'] && typeof d['jugada'] === 'object') {
      const j = d['jugada'] as Record<string, unknown>;
      if (typeof j['fila'] === 'number' && typeof j['columna'] === 'number')
        return { fila: j['fila'], columna: j['columna'] };
    }
    if (typeof d['fila'] === 'number' && typeof d['columna'] === 'number')
      return { fila: d['fila'], columna: d['columna'] };
    return null;
  }

  armarTablero(): void {
    this.tablero = [];
    for (let f = 0; f < this.filas; f++) {
      const fila: Cuadro[] = [];
      for (let c = 0; c < this.columnas; c++)
        fila.push({ fila: f, columna: c, levantado: false, esMina: false, numero: null });
      this.tablero.push(fila);
    }
  }

  limpiarDialogo(): void {
    this.dialogoVisible = false;
    this.cuadroPendiente = null;
    this.cuadroActual = null;
    this.opcionElegida = '';
    this.numeroEscrito = '';
    this.errorDialogo = '';
  }

  elegirMina(): void {
    if (!this.cargando) { this.opcionElegida = 'mina'; this.numeroEscrito = ''; this.errorDialogo = ''; }
  }

  elegirNumero(): void {
    if (!this.cargando) { this.opcionElegida = 'numero'; this.errorDialogo = ''; }
  }

  marcarNumeroAutomaticamente(): void {
    if (/^[0-8]$/.test(this.numeroEscrito.trim())) { this.opcionElegida = 'numero'; this.errorDialogo = ''; }
  }

  puedeConfirmar(): boolean {
    if (!this.cuadroPendiente || this.juegoTerminado || this.cargando) return false;
    if (this.opcionElegida === 'mina') return true;
    if (this.opcionElegida === 'numero') return /^[0-8]$/.test(this.numeroEscrito.trim());
    return false;
  }

  cancelarJugada(): void {
    if (this.cargando) return;
    this.limpiarDialogo();
    this.mensajeEstado = 'Jugada cancelada.';
  }

  obtenerTextoCuadro(c: Cuadro): string {
    if (!c.levantado) return '';
    if (c.esMina) return '✹';
    if (c.numero !== null) return String(c.numero);
    return '';
  }

  obtenerClaseNumero(c: Cuadro): string {
    if (!c.levantado || c.numero === null) return '';
    return `numero-${c.numero}`;
  }

  esCuadroActual(c: Cuadro): boolean {
    return !!this.cuadroActual && c.fila === this.cuadroActual.fila && c.columna === this.cuadroActual.columna;
  }
}
