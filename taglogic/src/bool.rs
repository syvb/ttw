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
            '&' => Some(Self::And),
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
                '(' | ')' | '&' | '|' | '!' => true,
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
            match c {
                '(' => tokens.push(Token::OpenBracket),
                ')' => tokens.push(Token::CloseBracket),
                '!' => tokens.push(Token::Invert),
                '&' => {
                    tokens.push(Token::BinaryOp(BinaryOp::And));
                    state = ParseState::InSymbolBinOp(BinaryOp::And);
                },
                '|' => {
                    tokens.push(Token::BinaryOp(BinaryOp::Or));
                    state = ParseState::InSymbolBinOp(BinaryOp::Or);
                },
                // ignore whitespace
                _ if c.is_whitespace() => {},
                _ => {
                    state = ParseState::InName;
                    cur_name = String::with_capacity(1);
                    cur_name.push(c);
                }
            }
        }
    }
    Ok(tokens)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn nested_lex() {
        let tokens = lex("abc & !(( ! xyz || dwf) | (!abc or dwp) & (dwp and r   ) )  ");
        assert_eq!(tokens, Ok(vec![
            Token::Name { text: "abc".to_string() },
            Token::BinaryOp(BinaryOp::And),
            Token::Invert,
            Token::OpenBracket,
            Token::OpenBracket,
            Token::Invert,
            Token::Name { text: "xyz".to_string() },
            Token::BinaryOp(BinaryOp::Or),
            Token::Name { text: "dwf".to_string() },
            Token::CloseBracket,
            Token::BinaryOp(BinaryOp::Or),
            Token::OpenBracket,
            Token::Invert,
            Token::Name { text: "abc".to_string() },
            Token::BinaryOp(BinaryOp::Or),
            Token::Name { text: "dwp".to_string() },
            Token::CloseBracket,
            Token::BinaryOp(BinaryOp::And),
            Token::OpenBracket,
            Token::Name { text: "dwp".to_string() },
            Token::BinaryOp(BinaryOp::And),
            Token::Name { text: "r".to_string() },
            Token::CloseBracket,
            Token::CloseBracket,
        ]));
    }
}
