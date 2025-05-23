var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var imp_csv = sequelize.define("imp_csv", {
  idCsv: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  despacho: { type: type.STRING, unique: "csvIndex1" },
  tipo_operacion: type.STRING,
  necesita_abonar_despacho: type.STRING,
  nave: type.STRING,
  proveedor: type.STRING,
  regimen_importacion: type.STRING,
  pais_origen: type.STRING,
  eta: type.STRING,
  fecha_factura: type.STRING,
  referencia_cliente: type.STRING,
  fecha_aceptacion: type.STRING,
  fecha_internacion_definitiva: type.STRING,
  fecha_pago: type.STRING,
  fecha_en_piso: type.STRING,
  fecha_despacho_factura: type.STRING,
  nombre_ejecutivo: type.STRING,
  cliente: type.STRING,
  rut_cliente: type.STRING,
  impuesto_di: type.STRING,
  estado_documentos: type.STRING,
  via_transporte: type.STRING,
  aduana: type.STRING,
  puerto_embarque: type.STRING,
});
sequelize.sync();

module.exports = imp_csv;
