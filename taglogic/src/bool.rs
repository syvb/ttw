use std::collections::VecDeque;
use wasm_bindgen::prelude::*;

const MAX_RECURSION: u16 = 20;
const MAX_LEN: usize = 200;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum BinaryOp {
    And,
    Or,
}

impl BinaryOp {
    pub fn as_char(self) -> char {
        match self {
            Self::And => '&',
            Self::Or => '|',
        }
    }
    pub fn from_char(c: char) -> Option<Self> {
        match c {
            '&' | ',' => Some(Self::And),
            '|' => Some(Self::Or),
            _ => None,
        }
    }
    pub fn from_text(text: &str) -> Option<Self> {
        match text {
            "and" => Some(Self::And),
            "or" => Some(Self::Or),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    OpenBracket,
    CloseBracket,
    Invert,
    Name { text: String },
    BinaryOp(BinaryOp),
}

fn lex(s: &str) -> Result<Vec<Token>, &'static str> {
    #[derive(Debug, Copy, Clone, Eq, PartialEq)]
    enum ParseState {
        AnyExpected,
        InName,
        /// Currently in a binary operation repersented with symbols instead of words.
        InSymbolBinOp(BinaryOp),
    }

    if s.len() >= MAX_LEN {
        return Err("expression too long");
    }

    let mut state = ParseState::AnyExpected;
    let mut tokens = Vec::new();
    let mut cur_name = String::new();
    for c in s.chars() {
        if let ParseState::InSymbolBinOp(op) = state {
            state = ParseState::AnyExpected;
            if c == op.as_char() {
                // continuning the last bin op (| and || are treated the same)
                continue;
            }
        }

        if state == ParseState::InName {
            let end_cur_token = match c {
                '(' | ')' | '!' => true,
                _ if BinaryOp::from_char(c) != None => true,
                _ if c.is_whitespace() => true,
                _ => false,
            };
            if end_cur_token {
                let lower = cur_name.to_ascii_lowercase();
                if let Some(op) = BinaryOp::from_text(&lower) {
                    tokens.push(Token::BinaryOp(op));
                } else {
                    tokens.push(Token::Name { text: cur_name });
                }
                cur_name = String::new();
                state = ParseState::AnyExpected;
            } else {
                cur_name.push(c);
            }
        }

        if state == ParseState::AnyExpected {
            let op = BinaryOp::from_char(c);
            match c {
                _ if op != None => {
                    tokens.push(Token::BinaryOp(op.unwrap()));
                    state = ParseState::InSymbolBinOp(op.unwrap());
                }
                '(' => tokens.push(Token::OpenBracket),
                ')' => tokens.push(Token::CloseBracket),
                '!' => tokens.push(Token::Invert),
                // ignore whitespace
                _ if c.is_whitespace() => {}
                _ => {
                    state = ParseState::InName;
                    cur_name = String::with_capacity(1);
                    cur_name.push(c);
                }
            }
        }
    }
    if !cur_name.is_empty() {
        let lower = cur_name.to_ascii_lowercase();
        if let Some(op) = BinaryOp::from_text(&lower) {
            tokens.push(Token::BinaryOp(op));
        } else {
            tokens.push(Token::Name { text: cur_name });
        }
    }
    Ok(tokens)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum AstNode {
    Invert(Box<AstNode>),
    Binary(BinaryOp, Box<AstNode>, Box<AstNode>),
    Name(String),
}

impl AstNode {
    fn munch_tokens(tokens: &mut VecDeque<Token>, depth: u16) -> Result<Self, &'static str> {
        if depth == 0 {
            return Err("expression too deep");
        }
        while let Some(next) = tokens.get(0) {
            match next {
                Token::CloseBracket => return Err("Unexpected closing bracket"),
                Token::Invert => {
                    tokens.remove(0);
                    // invert exactly the next token
                    // !a & b -> (!a) & b
                    match tokens.get(0) {
                        Some(Token::OpenBracket) => {
                            return Ok(AstNode::Invert(Box::new(Self::munch_tokens(
                                tokens,
                                depth - 1,
                            )?)));
                        }
                        Some(Token::Name { text }) => {
                            // is it like "!abc" or "!abc & xyz"
                            let inverted = AstNode::Invert(Box::new(AstNode::Name(text.clone())));
                            match tokens.get(1) {
                                Some(Token::BinaryOp(_)) => {
                                    // "!abc & xyz"
                                    // convert to unambiguous form and try again
                                    tokens.insert(0, Token::OpenBracket);
                                    tokens.insert(1, Token::Invert);
                                    tokens.insert(2, Token::OpenBracket);
                                    tokens.insert(4, Token::CloseBracket);
                                    tokens.insert(5, Token::CloseBracket);
                                    return Self::munch_tokens(tokens, depth - 1);
                                }
                                None | Some(Token::CloseBracket) => {
                                    // "!abc"
                                    tokens.remove(0); // remove name
                                    return Ok(inverted);
                                }
                                Some(_) => return Err("invalid token after inverted name"),
                            }
                        }
                        Some(Token::Invert) => {
                            return Err("can't double invert, that would be pointless")
                        }
                        Some(_) => return Err("expected expression"),
                        None => return Err("Expected token to invert, got EOF"),
                    }
                }
                Token::OpenBracket => {
                    tokens.remove(0); // open bracket
                    let result = Self::munch_tokens(tokens, depth - 1)?;
                    match tokens.remove(0) {
                        // remove closing bracket
                        Some(Token::CloseBracket) => {}
                        _ => return Err("expected closing bracket"),
                    };
                    // check for binary op afterwards
                    return match tokens.get(0) {
                        Some(Token::BinaryOp(op)) => {
                            let op = op.clone();
                            tokens.remove(0).unwrap(); // remove binary op
                            let ret = Ok(AstNode::Binary(
                                op,
                                Box::new(result),
                                Box::new(Self::munch_tokens(tokens, depth - 1)?),
                            ));
                            ret
                        }
                        Some(Token::CloseBracket) | None => Ok(result),
                        Some(_) => Err("invald token after closing bracket"),
                    };
                }
                Token::BinaryOp(_) => return Err("Unexpected binary operator"),
                Token::Name { text } => {
                    // could be the start of the binary op or just a lone name
                    match tokens.get(1) {
                        Some(Token::BinaryOp(_)) => {
                            // convert to unambiguous form and try again
                            tokens.insert(1, Token::CloseBracket);
                            tokens.insert(0, Token::OpenBracket);
                            return Self::munch_tokens(tokens, depth - 1);
                        }
                        Some(Token::CloseBracket) | None => {
                            // lone token
                            let text = text.clone();
                            tokens.remove(0);
                            return Ok(AstNode::Name(text));
                        }
                        Some(_) => return Err("name followed by invalid token"),
                    }
                }
            }
        }
        Err("unexpected end of expression")
    }

    fn matches(&self, tags: &[&str]) -> bool {
        // invert, binary, name
        match self {
            Self::Invert(inverted) => !inverted.matches(tags),
            Self::Name(name) => tags.contains(&&**name),
            Self::Binary(BinaryOp::And, a1, a2) => a1.matches(tags) && a2.matches(tags),
            Self::Binary(BinaryOp::Or, a1, a2) => a1.matches(tags) || a2.matches(tags),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ExprData {
    Empty,
    HasNodes(AstNode),
}

#[wasm_bindgen]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Expr(ExprData); // wrap internal implementation details

impl Expr {
    pub fn from_string(s: &str) -> Result<Self, &'static str> {
        let mut tokens: VecDeque<Token> = lex(s)?.into_iter().collect();
        if tokens.is_empty() {
            return Ok(Self(ExprData::Empty));
        }
        let ast = AstNode::munch_tokens(&mut tokens, MAX_RECURSION)?;
        if !tokens.is_empty() {
            dbg!(tokens);
            return Err("expected EOF, found extra tokens");
        }
        Ok(Self(ExprData::HasNodes(ast)))
    }

    pub fn matches(&self, tags: &[&str]) -> bool {
        match &self.0 {
            ExprData::Empty => true,
            ExprData::HasNodes(node) => node.matches(tags),
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn premature_eof() {
        assert_eq!(Expr::from_string("a &"), Err("unexpected end of expression"));
        assert_eq!(Expr::from_string("a & b &"), Err("unexpected end of expression"));
        assert_eq!(Expr::from_string("(a & b) |"), Err("unexpected end of expression"));
    }

    #[test]
    fn max_len() {
        assert!(matches!(Expr::from_string("01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"), Err(_)));
        assert!(matches!(Expr::from_string("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"), Ok(_)));
    }

    #[test]
    fn and_alias() {
        assert_eq!(
            Expr::from_string("a & b").unwrap().0,
            Expr::from_string("a, b").unwrap().0,
        );
    }

    #[test]
    fn simple_add() {
        assert_eq!(
            Expr::from_string("a & b").unwrap().0,
            ExprData::HasNodes(AstNode::Binary(
                BinaryOp::And,
                Box::new(AstNode::Name("a".to_string())),
                Box::new(AstNode::Name("b".to_string())),
            ))
        )
    }

    #[test]
    fn simple_inversion() {
        assert_eq!(
            Expr::from_string("!a & b").unwrap().0,
            ExprData::HasNodes(AstNode::Binary(
                BinaryOp::And,
                Box::new(AstNode::Invert(Box::new(AstNode::Name("a".to_string())))),
                Box::new(AstNode::Name("b".to_string())),
            ))
        )
    }

    #[test]
    fn unbracketed_multiple_bin_ops() {
        assert_eq!(
            Expr::from_string("a & b & c").unwrap().0,
            ExprData::HasNodes(AstNode::Binary(
                BinaryOp::And,
                Box::new(AstNode::Name("a".to_string())),
                Box::new(AstNode::Binary(
                    BinaryOp::And,
                    Box::new(AstNode::Name("b".to_string())),
                    Box::new(AstNode::Name("c".to_string())),
                )),
            ))
        )
    }

    #[test]
    fn multiple_with_inversion_in_middle() {
        assert_eq!(
            Expr::from_string("a & !b & c").unwrap().0,
            ExprData::HasNodes(AstNode::Binary(
                BinaryOp::And,
                Box::new(AstNode::Name("a".to_string())),
                Box::new(AstNode::Binary(
                    BinaryOp::And,
                    Box::new(AstNode::Invert(Box::new(AstNode::Name("b".to_string())))),
                    Box::new(AstNode::Name("c".to_string())),
                )),
            ))
        )
    }

    #[test]
    fn handles_invalid() {
        let tests = vec![
            "a &",
            " b|",
            "b and",
            "and at",
            "| dwp",
            "a | b | c | d |",
            "!",
            "tfw & !)",
            ")",
            "()",
            "((at) & a | b) | c)",
            "((at) & a | b) | c)",
            "a (&) b",
            "a (& b)",
        ];
        for test in tests {
            println!("trying: {}", test);
            assert!(matches!(Expr::from_string(test), Err(_)));
        }
    }

    #[test]
    fn lots_of_nesting() {
        assert_eq!(
            Expr::from_string("(((((((a & (((((b))))))))))))")
                .unwrap()
                .0,
            ExprData::HasNodes(AstNode::Binary(
                BinaryOp::And,
                Box::new(AstNode::Name("a".to_string())),
                Box::new(AstNode::Name("b".to_string())),
            ))
        );
        assert_eq!(
            Expr::from_string("(((((((a)))))))").unwrap().0,
            ExprData::HasNodes(AstNode::Name("a".to_string()))
        );
    }

    #[test]
    fn simple_and_matching() {
        assert!(Expr::from_string("a & b & c")
            .unwrap()
            .matches(&["a", "b", "c"]));
        assert!(!Expr::from_string("a & b & c").unwrap().matches(&["a", "c"]));
        assert!(!Expr::from_string("a & b & c").unwrap().matches(&["a", "b"]));
        assert!(!Expr::from_string("a & b & c").unwrap().matches(&["c", "b"]));
        assert!(Expr::from_string("a & b & c")
            .unwrap()
            .matches(&["a", "b", "c", "d"]));
        assert!(!Expr::from_string("a & b & c")
            .unwrap()
            .matches(&["a", "c", "d"]));
        assert!(!Expr::from_string("a & b & c")
            .unwrap()
            .matches(&["a", "b", "d"]));
        assert!(!Expr::from_string("a & b & c")
            .unwrap()
            .matches(&["c", "b", "d"]));
    }

    #[test]
    fn simple_or_matching() {
        assert!(Expr::from_string("a | b | c")
            .unwrap()
            .matches(&["a", "b", "c"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["a", "c"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["a", "b"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["c", "b"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["c"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["b"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["a"]));
        assert!(Expr::from_string("a | b | c")
            .unwrap()
            .matches(&["a", "b", "c", "d"]));
        assert!(Expr::from_string("a | b | c")
            .unwrap()
            .matches(&["a", "c", "d"]));
        assert!(Expr::from_string("a | b | c")
            .unwrap()
            .matches(&["a", "b", "d"]));
        assert!(Expr::from_string("a | b | c")
            .unwrap()
            .matches(&["c", "b", "d"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["c", "d"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["b", "d"]));
        assert!(Expr::from_string("a | b | c").unwrap().matches(&["a", "d"]));
        assert!(!Expr::from_string("a | b | c").unwrap().matches(&["ddwf"]));
        assert!(!Expr::from_string("a | b | c").unwrap().matches(&["d"]));
        assert!(!Expr::from_string("a | b | c")
            .unwrap()
            .matches(&["hdwf", "dtw"]));
    }

    #[test]
    fn op_bracket_resoultion() {
        assert_eq!(
            Expr::from_string("a & b | c"),
            Expr::from_string("a & (b | c)")
        );
        assert_eq!(
            Expr::from_string("a | b & c"),
            Expr::from_string("a | (b & c)")
        );
        assert_eq!(
            Expr::from_string("a & b | c & d"),
            Expr::from_string("a & (b | (c & d))")
        );
    }

    #[test]
    fn invert_bracket_resolution() {
        assert_eq!(
            Expr::from_string("a & !b | c"),
            Expr::from_string("a & ((!(b)) | c)")
        );
    }

    #[test]
    fn lone_name() {
        assert!(Expr::from_string("a").unwrap().matches(&["a"]));
        assert!(Expr::from_string("a").unwrap().matches(&["a", "b"]));
        assert!(!Expr::from_string("a").unwrap().matches(&["b"]));
    }

    #[test]
    fn lone_inverted_name() {
        assert!(!Expr::from_string("!a").unwrap().matches(&["a"]));
        assert!(!Expr::from_string("!a").unwrap().matches(&["a", "b"]));
        assert!(Expr::from_string("!a").unwrap().matches(&["b"]));
    }

    #[test]
    fn lone_inverted_bracketed_name() {
        assert!(!Expr::from_string("!(a)").unwrap().matches(&["a"]));
        assert!(!Expr::from_string("!(a)").unwrap().matches(&["a", "b"]));
        assert!(Expr::from_string("!(a)").unwrap().matches(&["b"]));
    }

    #[test]
    fn nested_expr() {
        let tokens = lex("abc & !(( ! xyz || dwf) | (!abc or dwp) & (dwp and r   ) )  ").unwrap();
        assert_eq!(
            tokens,
            vec![
                Token::Name {
                    text: "abc".to_string()
                },
                Token::BinaryOp(BinaryOp::And),
                Token::Invert,
                Token::OpenBracket,
                Token::OpenBracket,
                Token::Invert,
                Token::Name {
                    text: "xyz".to_string()
                },
                Token::BinaryOp(BinaryOp::Or),
                Token::Name {
                    text: "dwf".to_string()
                },
                Token::CloseBracket,
                Token::BinaryOp(BinaryOp::Or),
                Token::OpenBracket,
                Token::Invert,
                Token::Name {
                    text: "abc".to_string()
                },
                Token::BinaryOp(BinaryOp::Or),
                Token::Name {
                    text: "dwp".to_string()
                },
                Token::CloseBracket,
                Token::BinaryOp(BinaryOp::And),
                Token::OpenBracket,
                Token::Name {
                    text: "dwp".to_string()
                },
                Token::BinaryOp(BinaryOp::And),
                Token::Name {
                    text: "r".to_string()
                },
                Token::CloseBracket,
                Token::CloseBracket,
            ]
        );
        let mut tokens = tokens.into_iter().collect();
        let ast = AstNode::munch_tokens(&mut tokens, MAX_RECURSION).unwrap();
        assert!(tokens.is_empty());
        assert_eq!(
            format!("{:?}", ast),
            "Binary(And, Name(\"abc\"), Invert(Binary(Or, Binary(Or, Invert(Name(\"xyz\")), Name(\"dwf\")), Binary(And, Binary(Or, Invert(Name(\"abc\")), Name(\"dwp\")), Binary(And, Name(\"dwp\"), Name(\"r\"))))))".to_string()
        );
    }

    #[test]
    fn simple_lex() {
        let tokens = lex("foo and !(bar | !baz)").unwrap();
        assert_eq!(
            tokens,
            vec![
                Token::Name {
                    text: "foo".to_string()
                },
                Token::BinaryOp(BinaryOp::And),
                Token::Invert,
                Token::OpenBracket,
                Token::Name {
                    text: "bar".to_string()
                },
                Token::BinaryOp(BinaryOp::Or),
                Token::Invert,
                Token::Name {
                    text: "baz".to_string()
                },
                Token::CloseBracket
            ]
        );
    }
}
