/**
 * Expression Language Parser and Evaluator
 * Safe, non-Turing complete expression language for HTA models
 *
 * Reference: RFC-004 Expression Language Specification
 *
 * Supported:
 * - Arithmetic: +, -, *, /, %, ^
 * - Comparison: <, <=, >, >=, ==, !=
 * - Logical: and, or, not
 * - Functions: exp, ln, log, sqrt, abs, min, max, floor, ceil, round
 * - Special: if(cond, true, false), rate_to_prob, prob_to_rate, clamp
 * - Variables: parameter references, cycle, time, age
 */

// Token types
const TokenType = {
    NUMBER: 'NUMBER',
    IDENTIFIER: 'IDENTIFIER',
    OPERATOR: 'OPERATOR',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA',
    EOF: 'EOF'
};

// Operator precedence (higher = binds tighter)
const PRECEDENCE = {
    'or': 1,
    'and': 2,
    '==': 3, '!=': 3,
    '<': 4, '<=': 4, '>': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6, '%': 6,
    '^': 7
};

// Right-associative operators
const RIGHT_ASSOC = new Set(['^']);

// Built-in functions
const FUNCTIONS = {
    // Math functions
    exp: (x) => Math.exp(x),
    ln: (x) => Math.log(x),
    log: (x) => Math.log10(x),
    log10: (x) => Math.log10(x),
    sqrt: (x) => Math.sqrt(x),
    abs: (x) => Math.abs(x),
    floor: (x) => Math.floor(x),
    ceil: (x) => Math.ceil(x),
    round: (x) => Math.round(x),
    sin: (x) => Math.sin(x),
    cos: (x) => Math.cos(x),
    tan: (x) => Math.tan(x),

    // Multi-argument functions
    min: (...args) => Math.min(...args),
    max: (...args) => Math.max(...args),
    pow: (x, y) => Math.pow(x, y),

    // HTA-specific functions
    rate_to_prob: (rate, time = 1) => 1 - Math.exp(-rate * time),
    prob_to_rate: (prob, time = 1) => -Math.log(1 - prob) / time,
    odds_to_prob: (odds) => odds / (1 + odds),
    prob_to_odds: (prob) => prob / (1 - prob),
    clamp: (x, min, max) => Math.max(min, Math.min(max, x)),

    // Conditional
    if: (cond, trueVal, falseVal) => cond ? trueVal : falseVal
};

/**
 * Tokenizer - converts expression string to tokens
 */
class Tokenizer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.tokens = [];
    }

    isDigit(c) {
        return c >= '0' && c <= '9';
    }

    isAlpha(c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
    }

    isAlphaNum(c) {
        return this.isAlpha(c) || this.isDigit(c);
    }

    isWhitespace(c) {
        return c === ' ' || c === '\t' || c === '\n' || c === '\r';
    }

    peek() {
        return this.input[this.pos] || '';
    }

    advance() {
        return this.input[this.pos++] || '';
    }

    skipWhitespace() {
        while (this.isWhitespace(this.peek())) {
            this.advance();
        }
    }

    readNumber() {
        let num = '';
        while (this.isDigit(this.peek()) || this.peek() === '.') {
            num += this.advance();
        }
        // Scientific notation
        if (this.peek() === 'e' || this.peek() === 'E') {
            num += this.advance();
            if (this.peek() === '+' || this.peek() === '-') {
                num += this.advance();
            }
            while (this.isDigit(this.peek())) {
                num += this.advance();
            }
        }
        return { type: TokenType.NUMBER, value: parseFloat(num) };
    }

    readIdentifier() {
        let id = '';
        while (this.isAlphaNum(this.peek())) {
            id += this.advance();
        }
        // Check for keywords
        if (id === 'and' || id === 'or' || id === 'not') {
            return { type: TokenType.OPERATOR, value: id };
        }
        return { type: TokenType.IDENTIFIER, value: id };
    }

    tokenize() {
        this.tokens = [];

        while (this.pos < this.input.length) {
            this.skipWhitespace();

            if (this.pos >= this.input.length) break;

            const c = this.peek();

            if (this.isDigit(c) || (c === '.' && this.isDigit(this.input[this.pos + 1]))) {
                this.tokens.push(this.readNumber());
            } else if (this.isAlpha(c)) {
                this.tokens.push(this.readIdentifier());
            } else if (c === '(') {
                this.tokens.push({ type: TokenType.LPAREN, value: '(' });
                this.advance();
            } else if (c === ')') {
                this.tokens.push({ type: TokenType.RPAREN, value: ')' });
                this.advance();
            } else if (c === ',') {
                this.tokens.push({ type: TokenType.COMMA, value: ',' });
                this.advance();
            } else if ('+-*/%^'.includes(c)) {
                this.tokens.push({ type: TokenType.OPERATOR, value: c });
                this.advance();
            } else if (c === '<' || c === '>' || c === '=' || c === '!') {
                let op = this.advance();
                if (this.peek() === '=') {
                    op += this.advance();
                }
                this.tokens.push({ type: TokenType.OPERATOR, value: op });
            } else {
                throw new Error(`Unexpected character: ${c} at position ${this.pos}`);
            }
        }

        this.tokens.push({ type: TokenType.EOF, value: null });
        return this.tokens;
    }
}

/**
 * Abstract Syntax Tree node types
 */
class ASTNode {
    constructor(type) {
        this.type = type;
    }
}

class NumberNode extends ASTNode {
    constructor(value) {
        super('Number');
        this.value = value;
    }
}

class VariableNode extends ASTNode {
    constructor(name) {
        super('Variable');
        this.name = name;
    }
}

class BinaryOpNode extends ASTNode {
    constructor(op, left, right) {
        super('BinaryOp');
        this.op = op;
        this.left = left;
        this.right = right;
    }
}

class UnaryOpNode extends ASTNode {
    constructor(op, operand) {
        super('UnaryOp');
        this.op = op;
        this.operand = operand;
    }
}

class FunctionCallNode extends ASTNode {
    constructor(name, args) {
        super('FunctionCall');
        this.name = name;
        this.args = args;
    }
}

/**
 * Parser - converts tokens to AST using Pratt parsing
 */
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() {
        return this.tokens[this.pos] || { type: TokenType.EOF };
    }

    advance() {
        return this.tokens[this.pos++];
    }

    expect(type) {
        const token = this.advance();
        if (token.type !== type) {
            throw new Error(`Expected ${type}, got ${token.type}`);
        }
        return token;
    }

    parse() {
        const ast = this.parseExpression(0);
        if (this.peek().type !== TokenType.EOF) {
            throw new Error(`Unexpected token: ${this.peek().value}`);
        }
        return ast;
    }

    parseExpression(minPrecedence) {
        let left = this.parsePrimary();

        while (true) {
            const token = this.peek();
            if (token.type !== TokenType.OPERATOR) break;

            const precedence = PRECEDENCE[token.value];
            if (precedence === undefined || precedence < minPrecedence) break;

            this.advance();

            const nextMinPrec = RIGHT_ASSOC.has(token.value) ? precedence : precedence + 1;
            const right = this.parseExpression(nextMinPrec);

            left = new BinaryOpNode(token.value, left, right);
        }

        return left;
    }

    parsePrimary() {
        const token = this.peek();

        // Unary operators
        if (token.type === TokenType.OPERATOR && (token.value === '-' || token.value === 'not')) {
            this.advance();
            const operand = this.parsePrimary();
            return new UnaryOpNode(token.value, operand);
        }

        // Number literal
        if (token.type === TokenType.NUMBER) {
            this.advance();
            return new NumberNode(token.value);
        }

        // Identifier (variable or function call)
        if (token.type === TokenType.IDENTIFIER) {
            this.advance();
            const name = token.value;

            // Check for function call
            if (this.peek().type === TokenType.LPAREN) {
                this.advance(); // consume '('
                const args = [];

                if (this.peek().type !== TokenType.RPAREN) {
                    args.push(this.parseExpression(0));
                    while (this.peek().type === TokenType.COMMA) {
                        this.advance();
                        args.push(this.parseExpression(0));
                    }
                }

                this.expect(TokenType.RPAREN);
                return new FunctionCallNode(name, args);
            }

            return new VariableNode(name);
        }

        // Parenthesized expression
        if (token.type === TokenType.LPAREN) {
            this.advance();
            const expr = this.parseExpression(0);
            this.expect(TokenType.RPAREN);
            return expr;
        }

        throw new Error(`Unexpected token: ${token.type} (${token.value})`);
    }
}

/**
 * Expression Evaluator
 */
class ExpressionEvaluator {
    constructor() {
        this.functions = { ...FUNCTIONS };
    }

    /**
     * Evaluate an AST node with given context
     * @param {ASTNode} node - AST node
     * @param {Object} context - Variable values
     * @returns {number} Result
     */
    evaluate(node, context = {}) {
        switch (node.type) {
            case 'Number':
                return node.value;

            case 'Variable':
                if (!(node.name in context)) {
                    throw new Error(`Undefined variable: ${node.name}`);
                }
                return context[node.name];

            case 'BinaryOp':
                return this.evaluateBinaryOp(node, context);

            case 'UnaryOp':
                return this.evaluateUnaryOp(node, context);

            case 'FunctionCall':
                return this.evaluateFunctionCall(node, context);

            default:
                throw new Error(`Unknown node type: ${node.type}`);
        }
    }

    evaluateBinaryOp(node, context) {
        const left = this.evaluate(node.left, context);

        // Preserve logical short-circuit behavior so invalid right-hand
        // expressions are not evaluated when unnecessary.
        if (node.op === 'and') {
            if (!left) return 0;
            const right = this.evaluate(node.right, context);
            return right ? 1 : 0;
        }

        if (node.op === 'or') {
            if (left) return 1;
            const right = this.evaluate(node.right, context);
            return right ? 1 : 0;
        }

        const right = this.evaluate(node.right, context);

        switch (node.op) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/':
                if (right === 0) throw new Error('Division by zero');
                return left / right;
            case '%': return left % right;
            case '^': return Math.pow(left, right);
            case '<': return left < right ? 1 : 0;
            case '<=': return left <= right ? 1 : 0;
            case '>': return left > right ? 1 : 0;
            case '>=': return left >= right ? 1 : 0;
            case '==': return left === right ? 1 : 0;
            case '!=': return left !== right ? 1 : 0;
            default:
                throw new Error(`Unknown operator: ${node.op}`);
        }
    }

    evaluateUnaryOp(node, context) {
        const operand = this.evaluate(node.operand, context);

        switch (node.op) {
            case '-': return -operand;
            case 'not': return operand ? 0 : 1;
            default:
                throw new Error(`Unknown unary operator: ${node.op}`);
        }
    }

    evaluateFunctionCall(node, context) {
        // Evaluate `if` lazily: only the selected branch is executed.
        if (node.name === 'if') {
            if (node.args.length !== 3) {
                throw new Error('Function if expects exactly 3 arguments');
            }

            const condition = this.evaluate(node.args[0], context);
            if (condition) {
                return this.evaluate(node.args[1], context);
            }
            return this.evaluate(node.args[2], context);
        }

        const func = this.functions[node.name];
        if (!func) {
            throw new Error(`Unknown function: ${node.name}`);
        }

        const args = node.args.map(arg => this.evaluate(arg, context));
        return func(...args);
    }
}

/**
 * Dependency Analyzer - extracts variable dependencies and detects cycles
 */
class DependencyAnalyzer {
    /**
     * Extract all variable dependencies from an AST
     * @param {ASTNode} node - AST node
     * @returns {Set<string>} Set of variable names
     */
    extractDependencies(node) {
        const deps = new Set();
        this._collectDependencies(node, deps);
        return deps;
    }

    _collectDependencies(node, deps) {
        if (!node) return;

        switch (node.type) {
            case 'Variable':
                deps.add(node.name);
                break;
            case 'BinaryOp':
                this._collectDependencies(node.left, deps);
                this._collectDependencies(node.right, deps);
                break;
            case 'UnaryOp':
                this._collectDependencies(node.operand, deps);
                break;
            case 'FunctionCall':
                for (const arg of node.args) {
                    this._collectDependencies(arg, deps);
                }
                break;
        }
    }

    /**
     * Build dependency graph and detect circular dependencies
     * @param {Object} expressions - Map of name -> expression string
     * @returns {Object} { graph, order, cycles }
     */
    buildDependencyGraph(expressions) {
        const graph = {};
        const asts = {};

        // Parse all expressions and extract dependencies
        for (const [name, expr] of Object.entries(expressions)) {
            if (typeof expr === 'string') {
                const ast = ExpressionParser.parse(expr);
                asts[name] = ast;
                graph[name] = this.extractDependencies(ast);
            } else {
                graph[name] = new Set();
            }
        }

        // Detect cycles using DFS
        const cycles = this.detectCycles(graph);

        // Topological sort for evaluation order
        const order = cycles.length === 0 ? this.topologicalSort(graph) : null;

        return { graph, order, cycles, asts };
    }

    detectCycles(graph) {
        const cycles = [];
        const visited = new Set();
        const recStack = new Set();
        const path = [];

        const dfs = (node) => {
            if (recStack.has(node)) {
                const cycleStart = path.indexOf(node);
                cycles.push(path.slice(cycleStart).concat(node));
                return true;
            }

            if (visited.has(node)) return false;

            visited.add(node);
            recStack.add(node);
            path.push(node);

            const deps = graph[node] || new Set();
            for (const dep of deps) {
                if (Object.hasOwn(graph, dep)) {
                    dfs(dep);
                }
            }

            recStack.delete(node);
            path.pop();
            return false;
        };

        for (const node of Object.keys(graph)) {
            if (!visited.has(node)) {
                dfs(node);
            }
        }

        return cycles;
    }

    topologicalSort(graph) {
        const visited = new Set();
        const order = [];

        const visit = (node) => {
            if (visited.has(node)) return;
            visited.add(node);

            const deps = graph[node] || new Set();
            for (const dep of deps) {
                if (Object.hasOwn(graph, dep)) {
                    visit(dep);
                }
            }

            order.push(node);
        };

        for (const node of Object.keys(graph)) {
            visit(node);
        }

        return order;
    }
}

/**
 * Main Expression Parser interface
 */
const ExpressionParser = {
    /**
     * Parse an expression string to AST
     * @param {string} input - Expression string
     * @returns {ASTNode} AST
     */
    parse(input) {
        const tokenizer = new Tokenizer(input);
        const tokens = tokenizer.tokenize();
        const parser = new Parser(tokens);
        return parser.parse();
    },

    /**
     * Evaluate an expression string with context
     * @param {string} input - Expression string
     * @param {Object} context - Variable values
     * @returns {number} Result
     */
    evaluate(input, context = {}) {
        const ast = this.parse(input);
        const evaluator = new ExpressionEvaluator();
        return evaluator.evaluate(ast, context);
    },

    /**
     * Check if a string is a valid expression
     * @param {string} input - Expression string
     * @returns {Object} { valid, error }
     */
    validate(input) {
        try {
            this.parse(input);
            return { valid: true, error: null };
        } catch (e) {
            return { valid: false, error: e.message };
        }
    },

    /**
     * Extract dependencies from an expression
     * @param {string} input - Expression string
     * @returns {Set<string>} Variable dependencies
     */
    getDependencies(input) {
        const ast = this.parse(input);
        const analyzer = new DependencyAnalyzer();
        return analyzer.extractDependencies(ast);
    },

    /**
     * Detect circular dependencies in a set of expressions
     * @param {Object} expressions - Map of name -> expression
     * @returns {Object} Analysis result
     */
    analyzeDependencies(expressions) {
        const analyzer = new DependencyAnalyzer();
        return analyzer.buildDependencyGraph(expressions);
    },

    // Export classes for advanced usage
    Tokenizer,
    Parser,
    ExpressionEvaluator,
    DependencyAnalyzer,
    FUNCTIONS
};

// Export
if (typeof window !== 'undefined') {
    window.ExpressionParser = ExpressionParser;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExpressionParser };
}
