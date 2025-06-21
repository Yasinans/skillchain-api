const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);

    let error = {
        message: 'Internal server error',
        status: 500
    };

    if (err.name === 'ValidationError') {
        error.message = err.message;
        error.status = 400;
    } else if (err.name === 'UnauthorizedError') {
        error.message = 'Unauthorized';
        error.status = 401;
    } else if (err.message) {
        error.message = err.message;
    }

    res.status(error.status).json({
        error: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

const notFoundHandler = (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
};

module.exports = {
    errorHandler,
    notFoundHandler
};

