'use strict';

const path = require('path');

const babel = require('@babel/core');
const HTMLBarsInlinePrecompile = require('../index');
const TransformTemplateLiterals = require('@babel/plugin-transform-template-literals');
const TransformModules = require('@babel/plugin-transform-modules-amd');
const { stripIndent } = require('common-tags');

describe('htmlbars-inline-precompile', function () {
  let precompile, plugins, optionsReceived;

  function transform(code) {
    return babel
      .transform(code, {
        filename: 'foo-bar.js',
        plugins,
      })
      .code.trim();
  }

  beforeEach(function () {
    optionsReceived = undefined;
    precompile = (template, options) => {
      optionsReceived = options;
      return `"precompiled(${template})"`;
    };

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          precompile() {
            return precompile.apply(this, arguments);
          },
        },
      ],
    ];
  });

  it('supports compilation that returns a non-JSON.parseable object', function () {
    precompile = (template) => {
      return `function() { return "${template}"; }`;
    };

    let transpiled = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transpiled).toMatchInlineSnapshot(`
      "var compiled = Ember.HTMLBars.template(
      /*
        hello
      */
      function() { return \\"hello\\"; });"
    `);
  });

  it('passes options when used as a call expression', function () {
    let source = 'hello';
    transform(`import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('${source}');`);

    expect(optionsReceived).toEqual({
      contents: source,
    });
  });

  it('passes through isProduction option when used as a call expression', function () {
    let source = 'hello';

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          precompile() {
            return precompile.apply(this, arguments);
          },

          isProduction: true,
        },
      ],
    ];

    transform(`import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('${source}');`);

    expect(optionsReceived).toEqual({
      contents: source,
      isProduction: true,
    });
  });

  it('uses the user provided isProduction option if present', function () {
    let source = 'hello';

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          precompile() {
            return precompile.apply(this, arguments);
          },

          isProduction: false,
        },
      ],
    ];

    transform(
      `import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('${source}', { isProduction: true });`
    );

    expect(optionsReceived).toEqual({
      contents: source,
      isProduction: true,
    });
  });

  it('passes through isProduction option when used as a TaggedTemplateExpression', function () {
    let source = 'hello';

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          precompile() {
            return precompile.apply(this, arguments);
          },

          isProduction: true,
        },
      ],
    ];

    transform(`import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs\`${source}\`;`);

    expect(optionsReceived).toEqual({
      contents: source,
      isProduction: true,
    });
  });

  it('allows a template string literal when used as a call expression', function () {
    let source = 'hello';
    transform(`import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs(\`${source}\`);`);

    expect(optionsReceived).toEqual({
      contents: source,
    });
  });

  it('errors when the template string contains placeholders', function () {
    expect(() =>
      transform(
        "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs(`string ${value}`)"
      )
    ).toThrow(/placeholders inside a template string are not supported/);
  });

  it('errors when the template string is tagged', function () {
    expect(() =>
      transform("import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs(hbs`string`)")
    ).toThrow(/tagged template strings inside hbs are not supported/);
  });

  it('allows static userland options when used as a call expression', function () {
    let source = 'hello';
    transform(
      `import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('${source}', { parseOptions: { srcName: 'bar.hbs' }, moduleName: 'foo/bar.hbs', xyz: 123, qux: true, stringifiedThing: ${JSON.stringify(
        { foo: 'baz' }
      )}});`
    );

    expect(optionsReceived).toEqual({
      contents: source,
      parseOptions: { srcName: 'bar.hbs' },
      moduleName: 'foo/bar.hbs',
      xyz: 123,
      qux: true,
      stringifiedThing: {
        foo: 'baz',
      },
    });
  });

  it('adds a comment with the original template string', function () {
    let transformed = transform(stripIndent`
      import hbs from 'htmlbars-inline-precompile';
      if ('foo') {
        const template = hbs\`hello\`;
      }
    `);

    expect(transformed).toEqual(stripIndent`
      if ('foo') {
        const template = Ember.HTMLBars.template(
        /*
          hello
        */
        "precompiled(hello)");
      }
    `);
  });

  it('avoids a build time error when passed `insertRuntimeErrors`', function () {
    precompile = () => {
      throw new Error('NOOOOOOOOOOOOOOOOOOOOOO');
    };

    let transformed = transform(
      `import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('hello', { insertRuntimeErrors: true });`
    );

    expect(transformed).toMatchInlineSnapshot(`
      "var compiled = function () {
        throw new Error(\\"NOOOOOOOOOOOOOOOOOOOOOO\\");
      }();"
    `);
  });

  it('escapes any */ included in the template string', function () {
    let transformed = transform(stripIndent`
      import hbs from 'htmlbars-inline-precompile';
      if ('foo') {
        const template = hbs\`hello */\`;
      }
    `);

    expect(transformed).toEqual(stripIndent`
      if ('foo') {
        const template = Ember.HTMLBars.template(
        /*
          hello *\\/
        */
        "precompiled(hello */)");
      }
    `);
  });

  it('passes options when used as a tagged template string', function () {
    let source = 'hello';
    transform(`import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs\`${source}\`;`);

    expect(optionsReceived).toEqual({
      contents: source,
    });
  });

  it("strips import statement for 'htmlbars-inline-precompile' module", function () {
    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nimport Ember from 'ember';"
    );

    expect(transformed).toEqual("import Ember from 'ember';", 'strips import statement');
  });

  it('throws error when import statement is not using default specifier', function () {
    expect(() => transform("import { hbs } from 'htmlbars-inline-precompile'")).toThrow(
      /Only `import hbs from 'htmlbars-inline-precompile'` is supported/,
      'needed import syntax is present'
    );

    expect(() => transform("import { hbs } from 'htmlbars-inline-precompile'")).toThrow(
      /You used: `import { hbs } from 'htmlbars-inline-precompile'`/,
      'used import syntax is present'
    );
  });

  it('throws error when import statement is not using custom specifier', function () {
    plugins[0][1].modules = {
      'foo-bar': 'baz',
    };

    expect(() => transform("import hbs from 'foo-bar'")).toThrow(
      /Only `import { baz } from 'foo-bar'` is supported/,
      'needed import syntax is present'
    );

    expect(() => transform("import hbs from 'foo-bar'")).toThrow(
      /You used: `import hbs from 'foo-bar'`/,
      'used import syntax is present'
    );
  });

  it('replaces tagged template expressions with precompiled version', function () {
    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqual(
      'var compiled = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");',
      'tagged template is replaced'
    );
  });

  it('replaces tagged template expressions with precompiled version for custom import paths with named exports', function () {
    plugins[0][1].modules = {
      'foo-bar': 'baz',
    };

    let transformed = transform("import { baz } from 'foo-bar';\nvar compiled = baz`hello`;");

    expect(transformed).toEqual(
      'var compiled = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");'
    );
  });

  it('replaces tagged template expressions with precompiled version for custom import paths', function () {
    plugins[0][1].modulePaths = ['ember-cli-htmlbars-inline-precompile'];

    let transformed = transform(
      "import hbs from 'ember-cli-htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqual(
      'var compiled = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");'
    );
  });

  it('does not cause an error when no import is found', function () {
    expect(() => transform('something("whatever")')).not.toThrow();
    expect(() => transform('something`whatever`')).not.toThrow();
  });

  it('works with multiple imports', function () {
    let transformed = transform(`
      import hbs from 'htmlbars-inline-precompile';
      import otherHbs from 'htmlbars-inline-precompile';
      let a = hbs\`hello\`;
      let b = otherHbs\`hello\`;
    `);

    let expected = `let a = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");\nlet b = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");`;

    expect(transformed).toEqual(expected, 'tagged template is replaced');
  });

  it('works properly when used along with modules transform', function () {
    plugins.push([TransformModules]);
    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqual(
      `define([], function () {\n  "use strict";\n\n  var compiled = Ember.HTMLBars.template(\n  /*\n    hello\n  */\n  "precompiled(hello)");\n});`,
      'tagged template is replaced'
    );
  });

  it('works properly when used after modules transform', function () {
    plugins.unshift([TransformModules]);
    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqual(
      `define([], function () {\n  "use strict";\n\n  var compiled = Ember.HTMLBars.template(\n  /*\n    hello\n  */\n  "precompiled(hello)");\n});`,
      'tagged template is replaced'
    );
  });

  it('replaces tagged template expressions when before babel-plugin-transform-es2015-template-literals', function () {
    plugins.push([TransformTemplateLiterals]);
    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqual(
      'var compiled = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");',
      'tagged template is replaced'
    );
  });

  it("doesn't replace unrelated tagged template strings", function () {
    let transformed = transform(
      'import hbs from "htmlbars-inline-precompile";\nvar compiled = anotherTag`hello`;'
    );

    expect(transformed).toEqual(
      'var compiled = anotherTag`hello`;',
      'other tagged template strings are not touched'
    );
  });

  it('warns when the tagged template string contains placeholders', function () {
    expect(() =>
      transform(
        "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`string ${value}`"
      )
    ).toThrow(/placeholders inside a tagged template string are not supported/);
  });

  describe('caching', function () {
    it('include `baseDir` function for caching', function () {
      expect(HTMLBarsInlinePrecompile.baseDir()).toEqual(path.resolve(__dirname, '..'));
    });
  });

  describe('single string argument', function () {
    it("works with a plain string as parameter hbs('string')", function () {
      let transformed = transform(
        "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('hello');"
      );

      expect(transformed).toEqual(
        'var compiled = Ember.HTMLBars.template(\n/*\n  hello\n*/\n"precompiled(hello)");',
        'tagged template is replaced'
      );
    });

    it('warns when the second argument is not an object', function () {
      expect(() =>
        transform(
          "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs('first', 'second');"
        )
      ).toThrow(
        /hbs can only be invoked with 2 arguments: the template string, and any static options/
      );
    });

    it('warns when argument is not a string', function () {
      expect(() =>
        transform("import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs(123);")
      ).toThrow(/hbs should be invoked with at least a single argument: the template string/);
    });

    it('warns when no argument is passed', function () {
      expect(() =>
        transform("import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs();")
      ).toThrow(/hbs should be invoked with at least a single argument: the template string/);
    });
  });

  describe('with ember-source', function () {
    const compiler = require('ember-source/dist/ember-template-compiler');

    beforeEach(function () {
      precompile = (template, options) => {
        return compiler.precompile(template, options);
      };
    });

    it('includes the original template content', function () {
      let transformed = transform(stripIndent`
        import hbs from 'htmlbars-inline-precompile';

        const template = hbs\`hello {{firstName}}\`;
      `);

      expect(transformed).toContain(`hello {{firstName}}`);
    });
  });
});
