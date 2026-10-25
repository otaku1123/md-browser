import { describe, expect, it } from 'vitest';
import { plantUmlLines } from '../../src/core/plantuml';

describe('plantUmlLines', () => {
  it('adds @startuml / @enduml when the block leaves them out', () => {
    expect(plantUmlLines('A -> B\n')).toEqual(['@startuml', 'A -> B', '@enduml']);
  });

  it('keeps an explicit start tag of any diagram type', () => {
    expect(plantUmlLines('@startuml\r\nA -> B\r\n@enduml')).toEqual(['@startuml', 'A -> B', '@enduml']);
    expect(plantUmlLines('\n@startmindmap\n* root\n@endmindmap\n')).toEqual(['@startmindmap', '* root', '@endmindmap']);
  });
});
