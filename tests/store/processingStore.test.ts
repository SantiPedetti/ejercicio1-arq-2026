import { ProcessingStore, processingStore } from '../../src/store/processingStore';

describe('ProcessingStore', () => {
  it('guarda y recupera entradas de estado', () => {
    const store = new ProcessingStore();
    store.saveStatus({
      reservationId: 'R-100',
      status: 'PROCESSING',
      updatedAt: '2026-09-17T12:00:00.000Z'
    });

    const entry = store.find('R-100');
    expect(entry).toEqual({
      reservationId: 'R-100',
      status: 'PROCESSING',
      updatedAt: '2026-09-17T12:00:00.000Z'
    });
    expect(store.size()).toBe(1);
  });

  it('descarta la entrada mas vieja (FIFO) al alcanzar el limite de 1000', () => {
    const store = new ProcessingStore();
    for (let i = 0; i < 1000; i++) {
      store.saveStatus({
        reservationId: `R-${i}`,
        status: 'CONFIRMED',
        updatedAt: '2026-09-17T12:00:00.000Z'
      });
    }
    expect(store.size()).toBe(1000);
    expect(store.find('R-0')).toBeDefined();

    // Agregar el elemento 1001 debe desalojar a R-0 (FIFO)
    store.saveStatus({
      reservationId: 'R-1000',
      status: 'CONFIRMED',
      updatedAt: '2026-09-17T12:00:00.000Z'
    });

    expect(store.size()).toBe(1000);
    expect(store.find('R-0')).toBeUndefined();
    expect(store.find('R-1')).toBeDefined();
    expect(store.find('R-1000')).toBeDefined();
  });

  it('permite limpiar el store con clear()', () => {
    const store = new ProcessingStore();
    store.saveStatus({
      reservationId: 'R-1',
      status: 'CONFIRMED',
      updatedAt: '2026-09-17T12:00:00.000Z'
    });
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.find('R-1')).toBeUndefined();
  });

  it('no desaloja si se actualiza una entrada existente cuando el store esta en su maximo', () => {
    const store = new ProcessingStore();
    for (let i = 0; i < 1000; i++) {
      store.saveStatus({
        reservationId: `R-${i}`,
        status: 'CONFIRMED',
        updatedAt: '2026-09-17T12:00:00.000Z'
      });
    }

    // Actualizar R-50 no debe cambiar el tamano ni desalojar R-0
    store.saveStatus({
      reservationId: 'R-50',
      status: 'FAILED',
      updatedAt: '2026-09-17T12:05:00.000Z'
    });

    expect(store.size()).toBe(1000);
    expect(store.find('R-0')).toBeDefined();
    expect(store.find('R-50')?.status).toBe('FAILED');
  });

  it('guarda resultados con saveResult y los recupera con findResult', () => {
    const store = new ProcessingStore();
    const dummyResult = {
      reservationId: 'R-RES-1',
      status: 'CONFIRMED' as const,
      conversion: null,
      errors: [],
      warnings: [],
      trace: [],
      processedAt: '2026-09-17T12:00:00.000Z'
    };

    store.saveResult(dummyResult);
    expect(store.findResult('R-RES-1')).toEqual(dummyResult);
    expect(store.findResult('INEXISTENTE')).toBeUndefined();
  });

  it('guarda multiples resultados con saveAll', () => {
    const store = new ProcessingStore();
    const results = [
      {
        reservationId: 'R-ALL-1',
        status: 'CONFIRMED' as const,
        conversion: null,
        errors: [],
        warnings: [],
        trace: [],
        processedAt: '2026-09-17T12:00:00.000Z'
      },
      {
        reservationId: 'R-ALL-2',
        status: 'REJECTED' as const,
        conversion: null,
        errors: [],
        warnings: [],
        trace: [],
        processedAt: '2026-09-17T12:00:00.000Z'
      }
    ];

    store.saveAll(results);
    expect(store.size()).toBe(2);
    expect(store.findResult('R-ALL-1')).toBeDefined();
    expect(store.findResult('R-ALL-2')?.status).toBe('REJECTED');
  });

  it('el singleton processingStore funciona correctamente', () => {
    processingStore.clear();
    processingStore.saveStatus({
      reservationId: 'R-SINGLETON',
      status: 'CONFIRMED',
      updatedAt: '2026-09-17T12:00:00.000Z'
    });
    expect(processingStore.find('R-SINGLETON')?.reservationId).toBe('R-SINGLETON');
    processingStore.clear();
  });
});
