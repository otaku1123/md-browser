import { describe, expect, it } from 'vitest';
import { plantUmlError, plantUmlLines } from '../../src/core/plantuml';

describe('plantUmlLines', () => {
  it('adds @startuml / @enduml when the block leaves them out', () => {
    expect(plantUmlLines('A -> B\n')).toEqual(['@startuml', 'A -> B', '@enduml']);
  });

  it('keeps an explicit start tag of any diagram type', () => {
    expect(plantUmlLines('@startuml\r\nA -> B\r\n@enduml')).toEqual(['@startuml', 'A -> B', '@enduml']);
    expect(plantUmlLines('\n@startmindmap\n* root\n@endmindmap\n')).toEqual(['@startmindmap', '* root', '@endmindmap']);
  });
});

// Trimmed from what @plantuml/core returns for a syntax error.
const text = (fill: string, body: string) => `<text fill="${fill}">${body}</text>`;
const errorSvg = (line: number, ...messages: string[]) =>
  '<svg xmlns="http://www.w3.org/2000/svg"><g>' +
  text('#33FF02', 'PlantUML version $version$ / $git.commit.id$ [Unknown compile time]') +
  text('#000000', `[From textarea (line ${line}) ]`) +
  text('#33FF02', '@startuml') +
  text('#33FF02', 'foo bar baz') +
  messages.map((m) => text('#FF0000', ` ${m}`)).join('') +
  '</g></svg>';

describe('plantUmlError', () => {
  it('returns null for a real diagram', () => {
    expect(plantUmlError('<svg xmlns="http://www.w3.org/2000/svg"><text fill="#000000">Alice</text></svg>', 'Alice -> Bob')).toBeNull();
  });

  it('keeps the red message and maps the line back past the added @startuml', () => {
    expect(plantUmlError(errorSvg(3, 'Syntax Error? (Assumed diagram type: sequence)'), 'Alice -> Bob : hi\nfoo bar baz\n')).toBe(
      'line 2: Syntax Error? (Assumed diagram type: sequence)',
    );
  });

  it('counts leading blank lines and an explicit @startuml', () => {
    expect(plantUmlError(errorSvg(2, 'cannot include &lt;C4/C4_Context&gt;'), '\n!include <C4/C4_Context>\n')).toBe(
      'line 2: cannot include <C4/C4_Context>',
    );
    expect(plantUmlError(errorSvg(3, 'Syntax Error?'), '@startuml\nA -> B\nfoo bar baz\n@enduml')).toBe('line 3: Syntax Error?');
  });

  it('falls back to a generic message when no line is red', () => {
    expect(plantUmlError(errorSvg(3), 'A -> B\nfoo')).toBe('line 2: Syntax Error?');
  });
});
