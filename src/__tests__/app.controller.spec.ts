import * as fs from 'fs';

import { AppController } from '../app.controller';

describe('AppController', () => {
  let controller: AppController;
  let readSpy: jest.SpyInstance;

  beforeEach(() => {
    controller = new AppController();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getRoot returns metadata read from package.json', () => {
    readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        name: 'parking_simert',
        version: '0.0.1',
        url: 'https://clipp.app/',
        author: 'Clipp',
        architect: 'JP',
      }) as any,
    );

    const result = controller.getRoot();

    expect(readSpy).toHaveBeenCalledWith('package.json', 'utf-8');
    expect(result).toEqual({
      name: 'parking_simert',
      version: '0.0.1',
      url: 'https://clipp.app/',
      author: 'Clipp',
      architect: 'JP',
    });
  });
});
