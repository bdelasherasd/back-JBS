var sequelize = require("../models/sequelizeConnection");
var imp_importacion = require("../models/imp_importacion");

const getInvoiceNumber = async (nroDespacho) => {
  try {
    let data = await imp_importacion.findOne({
      attributes: ["refCliente"],
      where: {
        nroDespacho: nroDespacho,
      },
    });
    return data ? data.refCliente : null;
  } catch (error) {
    console.error("Error fetching invoice number:", error);
    throw new Error("Database query failed");
  }
};

module.exports = getInvoiceNumber;
