import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MiRutaPage } from './mi-ruta.page';

describe('MiRutaPage', () => {
  let component: MiRutaPage;
  let fixture: ComponentFixture<MiRutaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MiRutaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
