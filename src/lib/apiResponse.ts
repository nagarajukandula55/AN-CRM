export function successResponse(
  data: any = null,
  message = "Success"
) {
  return Response.json({
    success: true,
    message,
    data,
  });
}

export function errorResponse(
  message = "Something went wrong",
  status = 500
) {
  return Response.json(
    {
      success: false,
      message,
    },
    { status }
  );
}
