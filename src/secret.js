import readline from 'node:readline';

export async function promptSecret(prompt, { input = process.stdin, output = process.stdout } = {}) {
  output.write(prompt);

  const wasRaw = Boolean(input.isRaw);
  if (input.isTTY) input.setRawMode(true);
  input.resume();
  readline.emitKeypressEvents(input);

  return await new Promise((resolve) => {
    let value = '';

    const cleanup = () => {
      input.removeListener('keypress', onKeypress);
      input.removeListener('data', onData);
      if (input.isTTY) input.setRawMode(wasRaw);
      output.write('\n');
    };

    const finish = () => {
      cleanup();
      resolve(value);
    };

    const append = (chunk) => {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\b' || char === '\x7f') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    const onKeypress = (str, key = {}) => {
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.kill(process.pid, 'SIGINT');
        return;
      }
      if (str) value += str;
    };

    const onData = (chunk) => {
      if (!input.isTTY) append(chunk);
    };

    input.on('keypress', onKeypress);
    input.on('data', onData);
  });
}
