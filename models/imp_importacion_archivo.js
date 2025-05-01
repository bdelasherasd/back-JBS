var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var imp_importacion_archivo = sequelize.define("imp_importacion_archivo", {
  idImportacionArchivo: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  idImportacion: type.INTEGER,
  nroDespacho: type.STRING,
  nombreArchivo: type.STRING,
  ocrArchivo: "varchar(MAX)",
  detalles: "varchar(MAX)",
  packingList: "varchar(MAX)",
  ocrArchivoPL: "varchar(MAX)",
});
sequelize.sync({ alter: true });

module.exports = imp_importacion_archivo;
