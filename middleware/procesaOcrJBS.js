var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");
var getInvoiceNumber = require("./getInvoiceNumber");

const procesaOcrJbS = async (ocr, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrJbsTerrestre(ocr, nroDespacho);
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "MARITIMO") {
    return procesaOcrJbsMaritimo(ocr, nroDespacho);
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "AEREA") {
    return procesaOcrJbsAereo(ocr, nroDespacho);
  }
};

//const getPeso = async (ocr, ocrPL) => {
//  let tabla = ocr.ParsedResults[0].ParsedText.toUpperCase().split("\n");

//  for (let [i, e] of tabla.entries()) {
//    let texto = e.toUpperCase();
//    if (texto.includes("PESO LIQUIDO:")) {
//      const match = texto.match(/PESO LIQUIDO:\s*([0-9.,]+)/);
//      let peso = match[1]
//        .replace(/[^\d,\.]/g, "")
//        .replace(/\./g, "")
//        .replace(/,/g, ".");
//      return peso;
//    }
//  }
//};

const procesaOcrJbsAereo = async (ocr, nroDespacho) => {
  let data = [];

  //      ************* INICIO PROCESO AEREO *********************
  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("COMMERCIAL INVOICE")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("QUANTITY")) {
        i++;
        do {
          tabla[i] = tabla[i].replace("\t\t", "\t");
          tabla[i] = tabla[i].replace("KG $ ", "\t");
          tabla[i] = tabla[i].replace("/KG $", "");

          do {
            tabla[i] = tabla[i].replace("/", "");
          } while (tabla[i].includes("/"));
          do {
            tabla[i] = tabla[i].replace("'", "");
          } while (tabla[i].includes("'"));
          do {
            tabla[i] = tabla[i].replace("KG $", "");
          } while (tabla[i].includes("KG $"));
          do {
            tabla[i] = tabla[i].replace(",", "");
          } while (tabla[i].includes(","));

          let linea = tabla[i].split("\t");

          if (linea.length > 6) {
            let item = {
              cantidad: "0",
              codigo: "",
              descripcion: "",
              valor: "0",
              peso: "0",
              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
              pesoInvalido: false,
            };

            item.codigo = linea[1];
            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidad = linea[0];
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valor = linea[linea.length - 2];
            item.valorInvalido = await valValor(item.valor);
            (item.invoiceNumber = await getInvoiceNumber(nroDespacho)),
              (item.peso = linea[3]);
            if (isNaN(item.peso)) {
              item.peso = 0;
              item.pesoInvalido = true;
            }

            data.push(item);
          }
          i++;
        } while (!tabla[i].includes("USD"));
      }
    }
  }

  try {
    await imp_importacion_archivo.update(
      { detalles: JSON.stringify(data) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();

    //if (texto.includes("PACKING LIST")) {
    if (texto.includes("PROCESS DATE")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let textoTabla = ocr.ParsedResults[pagina].ParsedText;

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let columnas = texto.split("\t");

      if (texto.includes("PROCESS DATE")) {
        let indInicio = i + 1;
        let codigoActual = "";
        let k = indInicio;
        let ki = indInicio;
        let sumadias = 0;
        if (textoTabla.includes("CHILLED")) {
          sumadias = 90;
        } else {
          sumadias = 730;
        }

        //   INICIO  DE CICLO DE LECTURA

        let linea = tabla[k].split("\t");
        lineaFechas = tabla[k].split("\t")[0].split(" ");

        let item = {
          descripcion: codigoActual,
          fechaProduccion: "",
          sif: "",
          fechaVencimiento: "",
          CajasPallet: "",
          PesoNeto: "",
          PesoBruto: "",
        };

        item.sif = "1";

        let f = linea[0].replace("'", "/");
        f = f.slice(0, 10);
        if (f.length == 10) {
          let ano = f.slice(6, 10);
          let mes = f.slice(3, 5);
          let dia = f.slice(0, 2);
          item.fechaVencimiento = `${ano}/${mes}/${dia}`;
        } else {
          item.fechaVencimiento = linea[0].replace("'", "/");
        }

        let fechaParts = item.fechaVencimiento.split("/");
        if (fechaParts.length === 3) {
          let fechaObj = new Date(
            `${fechaParts[0]}-${fechaParts[1]}-${fechaParts[2]}`
          );
          fechaObj.setDate(fechaObj.getDate() + sumadias);
          let ano = fechaObj.getFullYear();
          let mes = String(fechaObj.getMonth() + 1).padStart(2, "0");
          let dia = String(fechaObj.getDate()).padStart(2, "0");
          item.fechaVencimiento = `${ano}/${mes}/${dia}`;
        }

        item.fechaInvalida = await valFecha(item.fechaVencimiento);
        item.CajasPallet = "1";
        item.PesoNeto = "1";
        item.PesoBruto = "1";

        dataPacking.push(item);

        //   FIN   DE CICLO DE LECTURA
      }
    }
  }
  try {
    await imp_importacion_archivo.update(
      { packingList: JSON.stringify(dataPacking) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }
};
//     ************* FIN PROCESO AEREO   **********************

//     *********** INICIO PROCESO TERRESTRE    **********************
const procesaOcrJbsTerrestre = async (ocr, nroDespacho) => {
  let data = [];

  // aplicacion terrestre

  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("COMMERCIAL INVOICE")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let indice = 0;

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("GOODS") && texto.includes("HS CODE")) {
        indice = i;
      }
    }

    i = indice + 1;
    do {
      let linea = tabla[i].split("\t");
      if (linea.length > 6) {
        let item = {
          cantidad: "0",
          codigo: "",
          descripcion: "",
          valor: "0",
          peso: "0",
          codigoInvalido: false,
        };
        let cod = linea[2].split(",");
        cod = linea[2].replace(/,/g, " ").split(" ");
        item.codigo = cod[0];

        do {
          linea[3] = linea[3].replace(".", "");
        } while (linea[3].includes("."));
        do {
          linea[3] = linea[3].replace(",", ".");
        } while (linea[3].includes(","));
        item.peso = linea[3];

        do {
          linea[6] = linea[6].replace(".", "");
        } while (linea[6].includes("."));
        do {
          linea[6] = linea[6].replace(",", ".");
        } while (linea[6].includes(","));
        item.valor = linea[6];

        item.codigoInvalido = await valCodigo(item.codigo);
        item.cantidadInvalida = await valCantidad(item.cantidad);
        item.valorInvalido = await valValor(item.valor);
        item.invoiceNumber = await getInvoiceNumber(nroDespacho);
        if (isNaN(item.peso)) {
          item.peso = 0;
          item.pesoInvalido = true;

          linea = tabla[i + 1].split("\t");
        }
        data.push(item);
      }
      i++;
    } while (tabla.length > i);
  }
  try {
    await imp_importacion_archivo.update(
      { detalles: JSON.stringify(data) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST")) {
      paginasPackingList.push(i);
    }
  }

  let ultimalineatabla = 0;
  let paginasPL = 0;

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    ultimalineatabla = tabla.length;
    paginasPL = pagina;
  }
  let lineainicial = 0;
  let tabla = ocr.ParsedResults[paginasPL].ParsedText.split("\n");

  do {
    texto = tabla[lineainicial].toUpperCase();
    lineainicial++;
  } while (lineainicial < ultimalineatabla && !texto.includes("GOODS"));

  lineainicial = lineainicial + 3;

  do {
    texto = tabla[lineainicial].toUpperCase();
    linea = tabla[lineainicial].split("\t");
    let lineaFechas = tabla[lineainicial].split("\t")[0].split(" ");

    if (lineaFechas[0].includes("|")) {
      let f = lineaFechas[0].split("|");
      lineaFechas[0] = f[0];
      lineaFechas[1] = f[1];
    }

    let item = {
      descripcion: "", //codigoActual"",
      fechaProduccion: "",
      sif: "",
      fechaVencimiento: "",
      CajasPallet: "",
      PesoNeto: "",
      PesoBruto: "",
    };
    if (linea.length > 3) {
      item.descripcion = "1";
      item.fechaProduccion = lineaFechas[0];
      item.sif = "1";

      //    Formatea Fechas //
      item.fechaVencimiento = lineaFechas[1];
      let f = lineaFechas[1].replace("'", "/");
      f = f.replace(":", "");
      f = f.replace("|", "");
      f = f.slice(0, 10);

      if (f.length == 10) {
        let ano = f.slice(6, 10);
        let mes = f.slice(3, 5);
        let dia = f.slice(0, 2);
        item.fechaVencimiento = `${ano}/${mes}/${dia}`;
      } else {
        item.fechaVencimiento = "1900/01/01";
      }

      //   Fin        Formatea fechas //

      item.CajasPallet = "1";
      do {
        linea[linea.length - 3] = linea[linea.length - 3].replace(".", "");
      } while (linea[linea.length - 3].includes("."));

      do {
        linea[linea.length - 3] = linea[linea.length - 3].replace(",", ".");
      } while (linea[linea.length - 3].includes(","));
      item.PesoNeto = linea[linea.length - 3];

      do {
        linea[linea.length - 2] = linea[linea.length - 2].replace(".", "");
      } while (linea[linea.length - 2].includes("."));

      do {
        linea[linea.length - 2] = linea[linea.length - 2].replace(",", ".");
      } while (linea[linea.length - 2].includes(","));

      item.PesoBruto = linea[linea.length - 2];

      item.fechaInvalida = await valFecha(item.fechaVencimiento);
      item.PesoNetoInvalido = await valFecha(item.PesoNeto);
      item.PesoBrutoInvalido = await valFecha(item.PesoBruto);
      dataPacking.push(item);
    }
    lineainicial++;
    texto = tabla[lineainicial].toUpperCase();
  } while (!texto.includes("TOTALS")); //|| (lineainicial < ultimalineatabla));
  try {
    await imp_importacion_archivo.update(
      { packingList: JSON.stringify(dataPacking) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }

  //for (let [j, pagina] of paginasPackingList.entries()) {
  //  let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
  //  ultimalineatabla = tabla.length ;

  //  for (let [i, e] of tabla.entries()) {
  //    let texto = e.toUpperCase();
  //    let columnas = texto.split("\t");

  //    if (texto.includes("GOODS")) {
  //      let indInicio = i + 3;
  //      let codigoActual = "";

  //      for (let k = indInicio; k < indInicio + 100; k++)
  //      {
  //        if (k >= tabla.length) {break;}

  //        //let lineaAnterior = tabla[k - 1].split("\t");

  //        let linea = tabla[k].split("\t");
  //        lineaFechas = tabla[k].split("\t")[0].split(" ");

  //        if (lineaFechas[0].includes("|"))
  //        { let f = lineaFechas[0].split("|"); lineaFechas[0] = f[0]; lineaFechas[1] = f[1];}

  //          let item = {descripcion: codigoActual,fechaProduccion: "",sif: "", fechaVencimiento: "",
  //          CajasPallet: "",PesoNeto: "", PesoBruto: "", };
  //          if (linea.length > 3) { //if (lineaAnterior.length < 3) {break;}

  //let codigo = lineaAnterior[2].split(" ")[2];

  //if (codigo && !codigo.includes(",")) {if (codigo) {codigoActual = codigo;}}

  //          item.descripcion = 1 ;//codigoActual;
  //          item.fechaProduccion = lineaFechas[0];
  //          item.sif = "1";
  //          item.fechaVencimiento = lineaFechas[1];
  //          if (item.fechaProduccion.includes("Total")) { break; }

  //   Inicio     Formatea fechas //

  //          let f = lineaFechas[1].replace("'", "/");
  //              f = f.replace(":", "");
  //          f = f.replace("|", ""); f = f.slice(0, 10);
  //          if (f.length == 10) {let ano = f.slice(6, 10);let mes = f.slice(3, 5);let dia = f.slice(0, 2);
  //              item.fechaVencimiento = `${ano}/${mes}/${dia}`;}
  //          else {item.fechaVencimiento = lineaFechas[1].replace("'", "/");}

  //   Fin        Formatea fechas //

  //          item.CajasPallet = "1";

  //         do {linea[linea.length - 3] = linea[linea.length - 3].replace(".", "");}
  //             while (linea[linea.length - 3].includes("."));

  //          do {linea[linea.length - 3] = linea[linea.length - 3].replace(",","."); }
  //             while (linea[linea.length - 3].includes(","));
  //             item.PesoNeto = linea[linea.length - 3];

  //          do {linea[linea.length - 2] = linea[linea.length - 2].replace(".","");}
  //              while (linea[linea.length - 2].includes("."));

  //          do {linea[linea.length - 2] = linea[linea.length - 2].replace(",",".");}
  //             while (linea[linea.length - 2].includes(","));

  //          item.PesoBruto = linea[linea.length - 2];
  //          item.fechaInvalida = await valFecha(item.fechaVencimiento);
  //          item.PesoNetoInvalido = await valFecha(item.PesoNeto);
  //          item.PesoBrutoInvalido = await valFecha(item.PesoBruto);

  //          if (!item.fechaProduccion.includes("TOTALS")) {
  //            dataPacking.push(item);
  //          }
  //        }
  //      }
  //      try {
  //        await imp_importacion_archivo.update(
  //          { packingList: JSON.stringify(dataPacking) },
  //          { where: { nroDespacho: nroDespacho } }
  //        );
  //      } catch (error) {
  //        console.log(error);
  //      }
  //    }
  //  }
  //}
};

//     ************FIN PROCESO TERRESTRE       **********************

//     ************INICIO PROCESO MARITIMO    ***********************
const procesaOcrJbsMaritimo = async (ocr, nroDespacho) => {
  let data = [];
  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("INVOICE")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("PRODUCT")) {
        i++;
        do {
          tabla[i] = tabla[i].replace("\t\t", "\t");
          tabla[i] = tabla[i].replace("KG $ ", "\t");
          tabla[i] = tabla[i].replace("/KG $", "");

          do {
            tabla[i] = tabla[i].replace("/", "");
          } while (tabla[i].includes("/"));
          do {
            tabla[i] = tabla[i].replace("'", "");
          } while (tabla[i].includes("'"));
          do {
            tabla[i] = tabla[i].replace("KG $", "");
          } while (tabla[i].includes("KG $"));
          do {
            tabla[i] = tabla[i].replace(",", "");
          } while (tabla[i].includes(","));

          let linea = tabla[i].split("\t");

          if (linea.length > 6) {
            let item = {
              cantidad: "0",
              codigo: "",
              descripcion: "",
              valor: "0",
              peso: "0",
              codigoInvalido: false,
              cantidadInvalida: false,
              valorInvalido: false,
              pesoInvalido: false,
            };

            item.codigo = linea[0];
            item.codigoInvalido = await valCodigo(item.codigo);
            item.cantidad = linea[4];
            item.cantidadInvalida = await valCantidad(item.cantidad);
            item.valor = linea[7];
            item.valorInvalido = await valValor(item.valor);
            item.invoiceNumber = await getInvoiceNumber(nroDespacho);
            item.peso = linea[5];
            if (isNaN(item.peso)) {
              item.peso = 0;
              item.pesoInvalido = true;
            }
            data.push(item);
          }
          i++;
        } while (!tabla[i].includes("Insurance"));
      }
    }
  }

  try {
    await imp_importacion_archivo.update(
      { detalles: JSON.stringify(data) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();

    //if (texto.includes("PACKING LIST")) {
    if (texto.includes("SLAUGHTER DATE")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let textoTabla = ocr.ParsedResults[pagina].ParsedText;

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let columnas = texto.split("\t");

      if (texto.includes("SLAUGHTER DATE")) {
        let indInicio = i + 1;
        let codigoActual = "";
        let k = indInicio;
        let ki = indInicio;
        let sumadias = 0;
        if (textoTabla.includes("CHILLED")) {
          sumadias = 90;
        } else {
          sumadias = 730;
        }

        //   INICIO  DE CICLO DE LECTURA

        let linea = tabla[k].split("\t");
        lineaFechas = tabla[k].split("\t")[0].split(" ");

        let item = {
          descripcion: codigoActual,
          fechaProduccion: "",
          sif: "",
          fechaVencimiento: "",
          CajasPallet: "",
          PesoNeto: "",
          PesoBruto: "",
        };

        item.sif = "1";

        let f = linea[0].replace("'", "/");
        f = f.slice(0, 10);
        if (f.length == 10) {
          let ano = f.slice(6, 10);
          let mes = f.slice(3, 5);
          let dia = f.slice(0, 2);
          item.fechaVencimiento = `${ano}/${mes}/${dia}`;
        } else {
          item.fechaVencimiento = linea[0].replace("'", "/");
        }

        let fechaParts = item.fechaVencimiento.split("/");
        if (fechaParts.length === 3) {
          let fechaObj = new Date(
            `${fechaParts[0]}-${fechaParts[1]}-${fechaParts[2]}`
          );
          fechaObj.setDate(fechaObj.getDate() + sumadias);
          let ano = fechaObj.getFullYear();
          let mes = String(fechaObj.getMonth() + 1).padStart(2, "0");
          let dia = String(fechaObj.getDate()).padStart(2, "0");
          item.fechaVencimiento = `${ano}/${mes}/${dia}`;
        }

        item.fechaInvalida = await valFecha(item.fechaVencimiento);
        item.CajasPallet = "1";
        item.PesoNeto = "1";
        item.PesoBruto = "1";

        dataPacking.push(item);

        //   FIN   DE CICLO DE LECTURA
      }
    }
  }
  try {
    await imp_importacion_archivo.update(
      { packingList: JSON.stringify(dataPacking) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }
};
//  *************    FI PROCESO MARITIMO ************************

module.exports = procesaOcrJbS;
