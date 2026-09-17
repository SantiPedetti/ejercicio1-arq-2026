import { ProcessingStore } from '../../src/store/processingStore';

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
});
