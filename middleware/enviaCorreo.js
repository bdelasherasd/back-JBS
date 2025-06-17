require("dotenv").config({ path: "variables.env" });
var nodemailer = require("nodemailer");

var timezone = process.env.TIMEZONE;
var mailServer = process.env.MAIL_SERVER;
var mailUsu = process.env.MAIL_USUARIO;
var mailPwd = process.env.MAIL_CONTRASENA;
var mailPort = process.env.MAIL_SMTPPORT;

const enviaCorreo = (destinatarios, asunto, texto) => {
  return new Promise(function (resolve, reject) {
    const transporter = nodemailer.createTransport({
      host: mailServer,
      port: mailPort,
      ignoreTLS: false,
      secure: true,
      auth: {
        user: mailUsu,
        pass: mailPwd,
      },
    });

    var mailOptions = {
      from: mailUsu,
      to: destinatarios,
      subject: asunto,
      html: texto,
      // attachments: [{
      //     filename: 'Afijo.csv',
      //     path: nombreArchivo,
      //     contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      // }]
    };

    transporter.sendMail(mailOptions, function (err, info) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        console.log("correo enviado");
        resolve("correo enviado");
      }
    });
  });
};

module.exports = enviaCorreo;
