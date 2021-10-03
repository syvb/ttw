module.exports = {
    pw: pw => {
        if (pw.length > 10000) return "Password cannot be longer than 10000 characters";
        if (pw.length < 8) return "Password must be at least 8 characters";
        if (pw.includes("\x00")) return "Password must not contain null bytes";
        return false;
    },
    username: usr => {
        if (usr.length > 15) return "Username cannot be longer than 15 characters";
        if (usr.length < 1) return "Username must be at least 1 character";
        if (!usr.match(/^[a-z]{1,15}$/)) return "Username can only contain ASCII letters";
        return false;
    },
    // https://emailregex.com/email-validation-summary/
    email: email => email.match(/(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/) ? false : "Invalid email",
};
